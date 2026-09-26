'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/permissions'

function num(formData: FormData, key: string) {
  const raw = String(formData.get(key) || '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function addProductSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'products.supplier_manage')
  if ('error' in access) return access

  const productId = String(formData.get('product_id') || '')
  const supplierId = String(formData.get('supplier_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  if (!productId || !supplierId) return { error: 'Product and supplier are required' }

  const payload = {
    product_id: productId,
    variant_id: variantId,
    supplier_id: supplierId,
    supplier_sku: String(formData.get('supplier_sku') || '').trim() || null,
    supplier_product_name: String(formData.get('supplier_product_name') || '').trim() || null,
    supplier_cost: num(formData, 'supplier_cost'),
    moq: num(formData, 'moq'),
    lead_time_days: num(formData, 'lead_time_days'),
    notes: String(formData.get('notes') || '').trim() || null,
  }

  const { data, error } = await supabase.from('product_suppliers').insert(payload).select('id').single()
  if (error) {
    if (error.code === '23505') return { error: 'This supplier is already mapped to this product/variant' }
    return { error: error.message }
  }

  await writeAudit(supabase, {
    action: 'create',
    entity: 'product_suppliers',
    entityId: data.id,
    next: { product_id: productId, supplier_id: supplierId, supplier_cost: payload.supplier_cost },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/products/${productId}`)
  return { success: true }
}

export async function updateProductSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'products.supplier_manage')
  if ('error' in access) return access

  const id = String(formData.get('id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!id || !productId) return { error: 'Mapping is required' }

  const { data: previous } = await supabase
    .from('product_suppliers')
    .select('supplier_cost, is_preferred, status')
    .eq('id', id)
    .maybeSingle()

  const payload = {
    supplier_sku: String(formData.get('supplier_sku') || '').trim() || null,
    supplier_product_name: String(formData.get('supplier_product_name') || '').trim() || null,
    supplier_cost: num(formData, 'supplier_cost'),
    moq: num(formData, 'moq'),
    lead_time_days: num(formData, 'lead_time_days'),
    notes: String(formData.get('notes') || '').trim() || null,
    status: String(formData.get('status') || 'active') === 'inactive' ? 'inactive' : 'active',
  }

  const { error } = await supabase.from('product_suppliers').update(payload).eq('id', id)
  if (error) return { error: error.message }

  if (previous && previous.supplier_cost !== payload.supplier_cost) {
    await supabase.from('supplier_cost_history').insert({
      product_supplier_id: id,
      old_cost: previous.supplier_cost,
      new_cost: payload.supplier_cost,
      changed_by: access.profile.id,
    })
  }

  await writeAudit(supabase, {
    action: 'update',
    entity: 'product_suppliers',
    entityId: id,
    previous,
    next: { supplier_cost: payload.supplier_cost, status: payload.status },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/products/${productId}`)
  return { success: true }
}

export async function setPreferredSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'products.supplier_manage')
  if ('error' in access) return access

  const id = String(formData.get('id') || '')
  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  if (!id || !productId) return { error: 'Mapping is required' }

  // Only one preferred supplier per product/variant scope.
  await supabase
    .from('product_suppliers')
    .update({ is_preferred: false })
    .eq('product_id', productId)
    .is('variant_id', variantId)
  const { error } = await supabase.from('product_suppliers').update({ is_preferred: true }).eq('id', id)
  if (error) return { error: error.message }

  await writeAudit(supabase, {
    action: 'update',
    entity: 'product_suppliers',
    entityId: id,
    next: { is_preferred: true },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/products/${productId}`)
  return { success: true }
}

export async function removeProductSupplier(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'products.supplier_manage')
  if ('error' in access) return access

  const id = String(formData.get('id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!id || !productId) return { error: 'Mapping is required' }

  const { count } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .not('supplier_id', 'is', null)
    .eq('product_id', productId)

  const { data: row } = await supabase.from('product_suppliers').select('supplier_id').eq('id', id).maybeSingle()
  const { error } = await supabase.from('product_suppliers').delete().eq('id', id)
  if (error) return { error: error.message }

  await writeAudit(supabase, {
    action: 'delete',
    entity: 'product_suppliers',
    entityId: id,
    previous: row,
    next: { note: count ? 'product still has historical order-item supplier references, unaffected' : undefined },
    userId: access.profile.id,
  })
  revalidatePath(`/crm/products/${productId}`)
  return { success: true }
}
