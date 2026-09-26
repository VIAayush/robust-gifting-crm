'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/permissions'

const STATUS_VALUES = ['active', 'inactive', 'blocked'] as const
type SupplierStatus = (typeof STATUS_VALUES)[number]

function supplierPayload(formData: FormData) {
  const num = (key: string) => {
    const raw = String(formData.get(key) || '').trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const str = (key: string) => String(formData.get(key) || '').trim() || null
  const status = String(formData.get('status') || 'active')

  return {
    name: str('name'),
    supplier_code: str('supplier_code'),
    legal_name: str('legal_name'),
    contact_person: str('contact_person'),
    email: str('email'),
    phone: str('phone'),
    address: str('address'),
    city: str('city'),
    state: str('state'),
    country: str('country') || 'India',
    gst_number: str('gst_number'),
    category: str('category'),
    payment_terms: str('payment_terms'),
    credit_period_days: num('credit_period_days') ?? 0,
    credit_limit: num('credit_limit') ?? 0,
    lead_time_days: num('lead_time_days'),
    moq: num('moq'),
    status: (STATUS_VALUES as readonly string[]).includes(status) ? (status as SupplierStatus) : 'active',
    notes: str('notes'),
  }
}

export async function createSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'suppliers.create')
  if ('error' in access) return access

  const payload = supplierPayload(formData)
  if (!payload.name) return { error: 'Supplier name is required' }

  const { data, error } = await supabase.from('suppliers').insert(payload).select('id').single()
  if (error || !data) return { error: error?.message || 'Could not create supplier' }

  await writeAudit(supabase, {
    action: 'create',
    entity: 'suppliers',
    entityId: data.id,
    next: { name: payload.name, status: payload.status },
    userId: access.profile.id,
  })
  revalidatePath('/crm/suppliers')
  return { success: true, id: data.id }
}

export async function updateSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'suppliers.edit')
  if ('error' in access) return access

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Supplier is required' }
  const payload = supplierPayload(formData)
  if (!payload.name) return { error: 'Supplier name is required' }

  const { data: previous } = await supabase.from('suppliers').select('name, status').eq('id', id).maybeSingle()

  const { error } = await supabase.from('suppliers').update(payload).eq('id', id)
  if (error) return { error: error.message }

  await writeAudit(supabase, {
    action: 'update',
    entity: 'suppliers',
    entityId: id,
    previous,
    next: { name: payload.name, status: payload.status },
    userId: access.profile.id,
  })
  revalidatePath('/crm/suppliers')
  revalidatePath(`/crm/suppliers/${id}`)
  return { success: true }
}

/** Deactivates (status='inactive') rather than deletes if the supplier is still referenced anywhere. */
export async function removeSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'suppliers.delete')
  if ('error' in access) return access

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Supplier is required' }

  const { data: row } = await supabase.from('suppliers').select('id, name').eq('id', id).maybeSingle()
  if (!row) return { error: 'Supplier not found' }

  const [{ count: productLinkCount }, { count: legacyProductCount }, { count: orderCount }, { count: orderItemCount }] =
    await Promise.all([
      supabase.from('product_suppliers').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
      supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('supplier_id', id),
    ])

  const referenced = Boolean(productLinkCount || legacyProductCount || orderCount || orderItemCount)
  if (referenced) {
    const { error } = await supabase.from('suppliers').update({ status: 'inactive' }).eq('id', id)
    if (error) return { error: error.message }
    await writeAudit(supabase, {
      action: 'deactivate',
      entity: 'suppliers',
      entityId: id,
      previous: { name: row.name },
      next: { status: 'inactive', reason: 'still referenced by products/orders' },
      userId: access.profile.id,
    })
    revalidatePath('/crm/suppliers')
    revalidatePath(`/crm/suppliers/${id}`)
    return { success: true, deactivated: true }
  }

  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return { error: error.message }
  await writeAudit(supabase, {
    action: 'delete',
    entity: 'suppliers',
    entityId: id,
    previous: { name: row.name },
    userId: access.profile.id,
  })
  revalidatePath('/crm/suppliers')
  return { success: true }
}
