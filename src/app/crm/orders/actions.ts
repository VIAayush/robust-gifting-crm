'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getProfile, canChangeOrderStage, canSeeCosts, isOpsStaff } from '@/lib/auth'
import { nextLifecycleStatus, checkStageMove, STAGE_DEPARTMENT, ORDER_STATUS_LABELS } from '@/lib/order-workflow'
import { requirePermission } from '@/lib/permissions'
import { writeAudit } from '@/lib/audit'
import { notifyOrderStatusChanged } from '@/lib/notifications'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Forms on the order page call these actions directly, and a plain `{ error }` return is dropped by <form action>,
 * so a refused change used to look like nothing happened. Redirect back with the reason instead; the page shows it.
 */
function orderFormError(orderId: string, message: string, tab?: string): never {
  const query = `${tab ? `tab=${tab}&` : ''}error=${encodeURIComponent(message.slice(0, 300))}`
  redirect(`/crm/orders/${orderId}?${query}`)
}

/** After a change succeeds, drop an error banner left on the page by an earlier refused change. */
async function clearStaleOrderError(): Promise<void> {
  const referer = (await headers()).get('referer')
  if (!referer || !/[?&]error=/.test(referer)) return
  let target: string | null = null
  try {
    const url = new URL(referer)
    url.searchParams.delete('error')
    target = `${url.pathname}${url.search}`
  } catch {
    target = null // a malformed referer: leave the page as it is
  }
  if (target) redirect(target)
}

const PROCUREMENT_STATUSES = [
  'not_assigned', 'supplier_selected', 'po_pending', 'po_raised', 'confirmed',
  'in_production', 'ready', 'dispatched', 'received', 'cancelled',
] as const

/**
 * Per-order-line supplier allocation, distinct from the order-level
 * assignSupplier() below - one order can have items fulfilled by different
 * suppliers. Snapshots supplier_sku/cost/lead_time at assignment time so a
 * later cost change on product_suppliers never rewrites what this specific
 * order actually paid.
 */
export async function assignOrderItemSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'orders.assign_supplier')
  if ('error' in access) return access

  const orderItemId = String(formData.get('order_item_id') || '')
  const orderId = String(formData.get('order_id') || '')
  const supplierId = String(formData.get('supplier_id') || '') || null
  if (!orderItemId || !orderId) return { error: 'Order item is required' }
  if (!UUID.test(orderItemId) || !UUID.test(orderId) || (supplierId && !UUID.test(supplierId))) return { error: 'Order item is required' }

  // The line must belong to the order named in the form: otherwise the audit trail and the page refresh would
  // describe a different order from the one actually changed.
  const { data: line } = await supabase.from('order_items').select('id, product_id, supplier_id, procurement_status').eq('id', orderItemId).eq('order_id', orderId).maybeSingle()
  if (!line) return { error: 'Order item not found on this order.' }

  if (supplierId) {
    const { data: supplier } = await supabase.from('suppliers').select('id, status').eq('id', supplierId).maybeSingle()
    if (!supplier) return { error: 'Supplier not found.' }
    if (supplier.status !== 'active') return { error: 'This supplier is not active, so it cannot be assigned to an order.' }
  }

  let snapshot: { supplier_sku_snapshot: string | null; supplier_cost_snapshot: number | null; supplier_lead_time_snapshot: number | null } = {
    supplier_sku_snapshot: null,
    supplier_cost_snapshot: null,
    supplier_lead_time_snapshot: null,
  }

  if (supplierId) {
    const item = line
    if (item?.product_id) {
      // The cost is read with the service role (the permission to assign suppliers was checked above); the ordinary
      // API role cannot read product_suppliers.supplier_cost after migration 20261037.
      const { data: mapping } = await (createAdminClient() ?? supabase)
        .from('product_suppliers')
        .select('supplier_sku, supplier_cost, lead_time_days')
        .eq('product_id', item.product_id)
        .eq('supplier_id', supplierId)
        .is('variant_id', null)
        .maybeSingle()
      if (mapping) {
        snapshot = {
          supplier_sku_snapshot: mapping.supplier_sku,
          supplier_cost_snapshot: mapping.supplier_cost,
          supplier_lead_time_snapshot: mapping.lead_time_days,
        }
      }
    }
  }

  const { error } = await supabase
    .from('order_items')
    .update({
      supplier_id: supplierId,
      ...snapshot,
      procurement_status: supplierId ? 'supplier_selected' : 'not_assigned',
      supplier_assigned_at: supplierId ? new Date().toISOString() : null,
      supplier_assigned_by: supplierId ? access.profile.id : null,
    })
    .eq('id', orderItemId)
    .eq('order_id', orderId)
  if (error) return { error: 'Could not assign the supplier. Please try again.' }

  await writeAudit(supabase, {
    action: 'assign_supplier',
    entity: 'order_items',
    entityId: orderItemId,
    // The cost snapshot itself is never written to the audit log (see lib/audit-redact.ts); only that one was recorded.
    previous: { order_id: orderId, supplier_id: line.supplier_id ?? null, procurement_status: line.procurement_status ?? null },
    next: {
      order_id: orderId,
      supplier_id: supplierId,
      procurement_status: supplierId ? 'supplier_selected' : 'not_assigned',
      supplier_sku_snapshot: snapshot.supplier_sku_snapshot,
      supplier_lead_time_snapshot: snapshot.supplier_lead_time_snapshot,
      cost_snapshot_recorded: snapshot.supplier_cost_snapshot !== null,
    },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/orders/${orderId}`)
  return { success: true }
}

export async function updateOrderItemProcurement(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'orders.procurement')
  if ('error' in access) return access

  const orderItemId = String(formData.get('order_item_id') || '')
  const orderId = String(formData.get('order_id') || '')
  const status = String(formData.get('procurement_status') || '')
  const notes = String(formData.get('procurement_notes') || '').trim() || null
  if (!orderItemId || !orderId) return { error: 'Order item is required' }
  if (!(PROCUREMENT_STATUSES as readonly string[]).includes(status)) return { error: 'Invalid procurement status' }
  if (!UUID.test(orderItemId) || !UUID.test(orderId)) return { error: 'Order item is required' }

  const { data: line } = await supabase.from('order_items').select('id, supplier_id, procurement_status').eq('id', orderItemId).eq('order_id', orderId).maybeSingle()
  if (!line) return { error: 'Order item not found on this order.' }
  // Progress beyond "not assigned" needs a supplier; otherwise the status would describe work nobody is doing.
  if (status !== 'not_assigned' && status !== 'cancelled' && !line.supplier_id) return { error: 'Assign a supplier to this item before updating its procurement status.' }

  const { error } = await supabase
    .from('order_items')
    .update({ procurement_status: status, procurement_notes: notes })
    .eq('id', orderItemId)
    .eq('order_id', orderId)
  if (error) return { error: 'Could not update the procurement status. Please try again.' }

  await writeAudit(supabase, {
    action: 'update_procurement_status',
    entity: 'order_items',
    entityId: orderItemId,
    previous: { order_id: orderId, procurement_status: line.procurement_status ?? null },
    next: { order_id: orderId, procurement_status: status },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/orders/${orderId}`)
  return { success: true }
}

export async function advanceOrderStatus(orderId: string, comment?: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!canChangeOrderStage(profile.role)) return { error: 'Not permitted to change order stages' }

  const supabase = await createClient()
  const { data: order } = await supabase.from('orders').select('id, status').eq('id', orderId).single()
  if (!order) return { error: 'Order not found' }
  const next = nextLifecycleStatus(order.status)
  if (!next) return { error: 'Order is already at a terminal stage' }

  const { data: dept } = await supabase.from('departments').select('id, manager_id').eq('slug', STAGE_DEPARTMENT[next] || 'operations').maybeSingle()

  const { error } = await supabase.rpc('advance_order_stage', {
    p_order_id: orderId,
    p_status: next,
    p_assigned_to: dept?.manager_id || null,
    p_department_id: dept?.id || null,
    p_comment: comment || `Advanced to ${next}`,
  })
  if (error) return { error: error.message }
  await notifyOrderStatusChanged(orderId, ORDER_STATUS_LABELS[next] || next)
  revalidatePath(`/crm/orders/${orderId}`)
  revalidatePath('/crm/order-management')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/my-work')
  return { success: true }
}

export async function handOffOrder(formData: FormData) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!canChangeOrderStage(profile.role)) return { error: 'Not permitted to change order stages' }

  const orderId = String(formData.get('order_id') || '')
  const status = String(formData.get('status') || '')
  const departmentId = String(formData.get('department_id') || '') || null
  const assignedTo = String(formData.get('assigned_to') || '') || null
  const comment = String(formData.get('comment') || '') || null
  const stageDue = String(formData.get('stage_due') || '') || null
  const nextAction = String(formData.get('next_action') || '') || null

  if (!orderId || !status) return { error: 'Stage is required' }
  if (!UUID.test(orderId)) return { error: 'Order not found' }

  const supabase = await createClient()
  const { data: current } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle()
  if (!current) orderFormError(orderId, 'Order not found.')
  const move = checkStageMove(String(current.status), status, profile.role, comment)
  if (!move.ok) orderFormError(orderId, move.error)
  const { error } = await supabase.rpc('advance_order_stage', {
    p_order_id: orderId,
    p_status: status,
    p_assigned_to: assignedTo,
    p_department_id: departmentId,
    p_comment: comment,
    p_stage_due: stageDue,
    p_next_action: nextAction,
  })
  if (error) orderFormError(orderId, error.message)
  await notifyOrderStatusChanged(orderId, ORDER_STATUS_LABELS[status] || status)
  revalidatePath(`/crm/orders/${orderId}`)
  revalidatePath('/crm/order-management')
  revalidatePath('/crm/department')
  revalidatePath('/crm/my-work')
  await clearStaleOrderError()
  return { success: true }
}

export async function setOrderStage(orderId: string, status: string, comment?: string, stageDue?: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!canChangeOrderStage(profile.role)) return { error: 'Not permitted to change order stages' }

  const allowed = new Set([...Object.keys(STAGE_DEPARTMENT), 'cancelled', 'in_progress'])
  if (!allowed.has(status)) return { error: 'Invalid stage' }

  const cleanComment = String(comment ?? '').trim().slice(0, 1000)
  const dueRaw = String(stageDue ?? '').trim()
  if (dueRaw && (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw) || Number.isNaN(Date.parse(dueRaw)))) return { error: 'Enter a valid due date.' }
  const dueDate = dueRaw || null

  const supabase = await createClient()
  const { data: current } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle()
  if (!current) return { error: 'Order not found' }
  // The reason must be typed by the user: the default text added below does not count as one.
  const move = checkStageMove(String(current.status), status, profile.role, cleanComment)
  if (!move.ok) return { error: move.error }

  const { data: dept } = await supabase
    .from('departments')
    .select('id, manager_id')
    .eq('slug', STAGE_DEPARTMENT[status] || 'operations')
    .maybeSingle()

  const { error } = await supabase.rpc('advance_order_stage', {
    p_order_id: orderId,
    p_status: status,
    p_assigned_to: dept?.manager_id || null,
    p_department_id: dept?.id || null,
    p_comment: cleanComment || `Moved to ${ORDER_STATUS_LABELS[status] || status} from Order Control Center`,
    p_stage_due: dueDate,
  })
  if (error) return { error: error.message }
  await notifyOrderStatusChanged(orderId, ORDER_STATUS_LABELS[status] || status)
  revalidatePath('/crm/order-management')
  revalidatePath(`/crm/orders/${orderId}`)
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/my-work')
  revalidatePath('/crm/department')
  return { success: true }
}

export async function assignSupplier(orderId: string, supplierId: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!isOpsStaff(profile.role)) return { error: 'Only operations or admin can assign vendors' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ supplier_id: supplierId || null })
    .eq('id', orderId)
  if (error) return { error: error.message }
  revalidatePath(`/crm/orders/${orderId}`)
  return { success: true }
}

export async function assignPrintingVendor(formData: FormData) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!isOpsStaff(profile.role)) return { error: 'Only operations or admin can assign vendors' }

  const orderId = String(formData.get('order_id') || '')
  if (!orderId) return { error: 'Order is required' }
  if (!UUID.test(orderId)) return { error: 'Order not found' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ printing_vendor_id: String(formData.get('printing_vendor_id') || '') || null })
    .eq('id', orderId)
  if (error) orderFormError(orderId, error.message, 'vendors')
  revalidatePath(`/crm/orders/${orderId}`)
  await clearStaleOrderError()
  return { success: true }
}

export async function assignCourier(orderId: string, courierId: string, trackingNumber?: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!isOpsStaff(profile.role)) return { error: 'Only operations or admin can record shipping' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ courier_partner_id: courierId || null, tracking_number: trackingNumber || null })
    .eq('id', orderId)
  if (error) return { error: error.message }
  revalidatePath(`/crm/orders/${orderId}`)
  return { success: true }
}

export async function recordDelivery(formData: FormData) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!isOpsStaff(profile.role)) return { error: 'Only operations or admin can record delivery dates' }

  const orderId = String(formData.get('order_id') || '')
  if (!orderId) return { error: 'Order is required' }
  if (!UUID.test(orderId)) return { error: 'Order not found' }

  const dispatchDate = String(formData.get('dispatch_date') || '') || null
  const expected = String(formData.get('expected_delivery_date') || '') || null
  const actual = String(formData.get('actual_delivery_date') || '') || null

  if (dispatchDate && actual && actual < dispatchDate) {
    orderFormError(orderId, 'Actual delivery cannot be earlier than the dispatch date.', 'vendors')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({
      dispatch_date: dispatchDate,
      expected_delivery_date: expected,
      actual_delivery_date: actual,
    })
    .eq('id', orderId)
  if (error) orderFormError(orderId, error.message, 'vendors')
  revalidatePath(`/crm/orders/${orderId}`)
  revalidatePath('/crm/order-management')
  await clearStaleOrderError()
  return { success: true }
}

export async function saveOrderCosting(formData: FormData) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!canSeeCosts(profile.role)) return { error: 'Not permitted to edit order costing' }

  const orderId = String(formData.get('order_id') || '')
  if (!orderId) return { error: 'Order is required' }
  if (!UUID.test(orderId)) return { error: 'Order not found' }

  const read = (key: string) => {
    const raw = formData.get(key)
    if (raw === null || String(raw).trim() === '') return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }

  const costs = {
    product_cost: read('product_cost'),
    printing_cost: read('printing_cost'),
    courier_cost: read('courier_cost'),
    other_cost: read('other_cost'),
  }
  if (Object.values(costs).some((v) => Number.isNaN(v))) {
    orderFormError(orderId, 'Costs must be zero or a positive number.', 'financials')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('orders').update(costs).eq('id', orderId)
  if (error) orderFormError(orderId, error.message, 'financials')

  // total_cost and gross_profit are derived server-side, never sent by the client.
  const { error: recalcError } = await supabase.rpc('recalc_order_cost', { p_order_id: orderId })
  if (recalcError) orderFormError(orderId, recalcError.message, 'financials')

  revalidatePath(`/crm/orders/${orderId}`)
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/reports')
  await clearStaleOrderError()
  return { success: true }
}
