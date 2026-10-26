import type { SupabaseClient } from '@supabase/supabase-js'

type Mapping = {
  product_id: string
  variant_id: string | null
  supplier_id: string
  supplier_sku: string | null
  supplier_cost: number | null
  lead_time_days: number | null
  is_preferred: boolean | null
  status: string | null
}

/**
 * Gives every unassigned line on an order its product's preferred supplier,
 * with the supplier SKU / cost / lead time snapshotted from product_suppliers.
 * A variant-specific mapping wins over the product-level one; products with no
 * product_suppliers row fall back to products.supplier_id. A missing supplier
 * cost stays null (shown as "cost not set"), it is never invented.
 * Must run with a client that can update order_items (the service role).
 */
export async function assignPreferredSuppliers(admin: SupabaseClient, orderId: string): Promise<{ assigned: number; error?: string }> {
  const { data: items, error } = await admin
    .from('order_items')
    .select('id, product_id, variant_id')
    .eq('order_id', orderId)
    .is('supplier_id', null)
    .not('product_id', 'is', null)
  if (error) return { assigned: 0, error: error.message }
  if (!items || items.length === 0) return { assigned: 0 }

  const productIds = Array.from(new Set(items.map((i) => i.product_id as string)))
  const [{ data: mappings }, { data: products }] = await Promise.all([
    admin
      .from('product_suppliers')
      .select('product_id, variant_id, supplier_id, supplier_sku, supplier_cost, lead_time_days, is_preferred, status')
      .in('product_id', productIds),
    admin.from('products').select('id, supplier_id').in('id', productIds),
  ])

  const usable = ((mappings || []) as Mapping[]).filter((m) => !m.status || m.status === 'active')
  const legacySupplier = new Map((products || []).map((p) => [p.id as string, (p.supplier_id as string | null) || null]))

  const pick = (productId: string, variantId: string | null): Mapping | null => {
    const forProduct = usable.filter((m) => m.product_id === productId)
    const ranked = (list: Mapping[]) => list.find((m) => m.is_preferred) || (list.length === 1 ? list[0] : null)
    if (variantId) {
      const variantMatch = ranked(forProduct.filter((m) => m.variant_id === variantId))
      if (variantMatch) return variantMatch
    }
    return ranked(forProduct.filter((m) => !m.variant_id))
  }

  const now = new Date().toISOString()
  let assigned = 0
  for (const item of items) {
    const mapping = pick(item.product_id as string, (item.variant_id as string | null) || null)
    const supplierId = mapping?.supplier_id || legacySupplier.get(item.product_id as string) || null
    if (!supplierId) continue
    const { error: updateError } = await admin
      .from('order_items')
      .update({
        supplier_id: supplierId,
        supplier_sku_snapshot: mapping?.supplier_sku ?? null,
        supplier_cost_snapshot: mapping?.supplier_cost ?? null,
        supplier_lead_time_snapshot: mapping?.lead_time_days ?? null,
        procurement_status: 'supplier_selected',
        supplier_assigned_at: now,
        supplier_assigned_by: null,
      })
      .eq('id', item.id)
      .is('supplier_id', null)
    if (!updateError) assigned += 1
  }
  return { assigned }
}
