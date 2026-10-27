'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assignPreferredSuppliers } from '@/lib/orders/preferred-suppliers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { notifyOrderCreated, notifyRequirementEvent } from '@/lib/notifications'
import { canEditQuotation, validateHeader, validateLine } from '@/lib/quotations/line-rules'
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: ['sent'],
}

export async function updateQuotationStatus(quotationId: string, newStatus: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!['admin', 'sales', 'management'].includes(profile.role)) {
    return { error: 'Not permitted to change quotation status' }
  }

  const supabase = await createClient()
  const { data: quote, error: readError } = await supabase
    .from('quotations')
    .select('id, status, requirement_id')
    .eq('id', quotationId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!quote) return { error: 'Quotation not found' }

  const current = quote.status || 'draft'
  if (!(ALLOWED_TRANSITIONS[current] || []).includes(newStatus)) {
    return { error: `A ${current} quotation cannot move to ${newStatus}` }
  }

  const { error } = await supabase.from('quotations').update({ status: newStatus }).eq('id', quotationId)
  if (error) return { error: error.message }

  await writeAudit(supabase, {
    action: 'status_change',
    entity: 'quotations',
    entityId: quotationId,
    previous: { status: current },
    next: { status: newStatus },
    userId: profile.id,
  })

  // Quotations that came from a client requirement tell the client their quotation is ready.
  if (newStatus === 'sent' && quote.requirement_id) await notifyRequirementEvent(quote.requirement_id as string, 'quotation_sent')

  revalidatePath(`/crm/quotations/${quotationId}`)
  revalidatePath('/crm/quotations')
  return { success: true }
}
export async function convertToOrder(quotationId: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!['admin', 'sales'].includes(profile.role)) {
    return { error: 'Not permitted to convert quotations' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('convert_quotation_to_order', { p_quotation_id: quotationId })
  if (error) return { error: error.message }
  // Give each new order line its product's preferred supplier (system step, so service role).
  const admin = createAdminClient()
  if (admin && data) {
    const assigned = await assignPreferredSuppliers(admin, data as string)
    if (assigned.error) console.error('[quotations] supplier auto-assign failed', assigned.error)
  }
  await writeAudit(supabase, {
    action: 'create',
    entity: 'orders',
    entityId: data,
    next: { quotation_id: quotationId },
    userId: profile.id,
  })
  await notifyOrderCreated(data)
  redirect(`/crm/orders/${data}`)
}
export async function duplicateQuotation(quotationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('duplicate_quotation', { p_quotation_id: quotationId })
  if (error) return { error: error.message }
  redirect(`/crm/quotations/${data}`)
}

// ---------------------------------------------------------------------------
// Draft quotation editing (SOW 3.5): line items, quantities, prices, discount and tax.
// Only admin/sales, only while the quotation is a draft; totals are recomputed in the database.
// ---------------------------------------------------------------------------
type EditResult = { success: true } | { error: string }

async function draftEditor(quotationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(quotationId)) return { ok: false, error: 'Quotation not found.' } as const
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { ok: false, error: 'Your session has expired. Please sign in again.' } as const
  if (profile.role !== 'admin' && profile.role !== 'sales') return { ok: false, error: 'Not permitted to edit quotations.' } as const
  const supabase = await createClient()
  const { data: quote } = await supabase.from('quotations').select('id, status, owner_id').eq('id', quotationId).maybeSingle()
  if (!quote) return { ok: false, error: 'Quotation not found.' } as const
  if (!canEditQuotation(quote.status)) return { ok: false, error: 'Only a draft quotation can be edited. Duplicate it to make changes.' } as const
  return { ok: true, supabase, profile } as const
}

function afterEdit(quotationId: string) {
  revalidatePath(`/crm/quotations/${quotationId}`)
  revalidatePath('/crm/quotations')
}

export async function saveQuotationItem(
  quotationId: string,
  itemId: string | null,
  input: { sku?: string; quantity: string; unit_price: string; discount_percent: string; tax_percent: string },
): Promise<EditResult> {
  const access = await draftEditor(quotationId)
  if (!access.ok) return { error: access.error }
  const { supabase, profile } = access

  if (itemId !== null) {
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { error: 'Item not found.' }
    const checked = validateLine(input)
    if ('error' in checked) return checked
    const { error } = await supabase.from('quotation_items').update(checked.value).eq('id', itemId).eq('quotation_id', quotationId)
    if (error) return { error: 'We could not save the item. Please try again.' }
  } else {
    const sku = String(input.sku || '').trim().toUpperCase()
    if (!sku) return { error: 'Enter the SKU of the product to add.' }
    const { data: product } = await supabase.from('products').select('id, name, price, status').eq('sku', sku).maybeSingle()
    if (!product || product.status !== 'active') return { error: 'No active product has that SKU.' }
    const checked = validateLine({ ...input, unit_price: String(input.unit_price).trim() === '' ? product.price : input.unit_price })
    if ('error' in checked) return checked
    const { error } = await supabase.from('quotation_items').insert({ quotation_id: quotationId, product_id: product.id, description: product.name, ...checked.value })
    if (error) return { error: 'We could not add the item. Please try again.' }
  }

  const { error: recalcError } = await supabase.rpc('recalc_quotation_totals', { p_quotation_id: quotationId })
  if (recalcError) return { error: 'The item was saved but totals could not be recalculated. Please refresh.' }
  await writeAudit(supabase, { action: itemId ? 'update' : 'create', entity: 'quotation_items', entityId: itemId, next: { quotation_id: quotationId }, userId: profile.id })
  afterEdit(quotationId)
  return { success: true }
}

export async function removeQuotationItem(quotationId: string, itemId: string): Promise<EditResult> {
  const access = await draftEditor(quotationId)
  if (!access.ok) return { error: access.error }
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { error: 'Item not found.' }
  const { supabase, profile } = access
  const { error } = await supabase.from('quotation_items').delete().eq('id', itemId).eq('quotation_id', quotationId)
  if (error) return { error: 'We could not remove the item. Please try again.' }
  await supabase.rpc('recalc_quotation_totals', { p_quotation_id: quotationId })
  await writeAudit(supabase, { action: 'delete', entity: 'quotation_items', entityId: itemId, next: { quotation_id: quotationId }, userId: profile.id })
  afterEdit(quotationId)
  return { success: true }
}

export async function saveQuotationHeader(
  quotationId: string,
  input: { tax_percent: string; discount_percent: string; valid_until: string; notes: string },
): Promise<EditResult> {
  const access = await draftEditor(quotationId)
  if (!access.ok) return { error: access.error }
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const checked = validateHeader(input, today)
  if ('error' in checked) return checked
  const { supabase, profile } = access
  const { error } = await supabase.from('quotations').update(checked.value).eq('id', quotationId)
  if (error) return { error: 'We could not save the terms. Please try again.' }
  await supabase.rpc('recalc_quotation_totals', { p_quotation_id: quotationId })
  await writeAudit(supabase, { action: 'update', entity: 'quotations', entityId: quotationId, next: checked.value, userId: profile.id })
  afterEdit(quotationId)
  return { success: true }
}
