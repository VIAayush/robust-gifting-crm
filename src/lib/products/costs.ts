import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Product cost fields (products.supplier_cost, internal_margin, internal_notes and product_suppliers.supplier_cost)
 * are not readable through the ordinary table API once migration 20261037 is applied. Authorised staff read them
 * through SECURITY DEFINER functions that check the caller's role/permission; a direct API query by an anonymous
 * visitor, a client or an unauthorised staff member returns "permission denied" instead of numbers.
 *
 * Until that migration is applied the same values are read straight from the tables, so nothing changes for users
 * who were already allowed to see them. Callers must still decide whether to ask at all; the database enforces the
 * same rule underneath. Failure never invents a value: an error returns an empty result, and callers must not render
 * an editable cost field when the cost could not be loaded (saving a blank would erase it).
 */

/** Every products column EXCEPT the cost columns and sales_channel (which only exists after its own migration). */
export const PRODUCT_COLUMNS =
  'id, name, brand_id, category_id, subcategory_id, description, price, moq, hsn_code, supplier_id, image_url, status, created_at, updated_at, visibility, sku, catalogue_access, customization_enabled, customization_fields, mrp, price_updated_at' as const

/** Same as above for use inside an embedded relation, e.g. `product:products(${PRODUCT_EMBED_COLUMNS})`. */
export const PRODUCT_EMBED_COLUMNS = PRODUCT_COLUMNS

export type ProductCosts = { supplier_cost: number | null; internal_margin: number | null; internal_notes: string | null }

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value))

function isMissingFunction(error: { code?: string; message: string } | null) {
  return Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message)))
}

/** Cost, margin and internal notes for the given products, keyed by product id. Empty when not permitted. */
export async function loadProductCosts(supabase: SupabaseClient, productIds: string[]): Promise<Map<string, ProductCosts>> {
  const result = new Map<string, ProductCosts>()
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (ids.length === 0) return result

  const viaFunction = await supabase.rpc('product_cost_summary', { p_product_ids: ids })
  if (!viaFunction.error) {
    for (const row of (viaFunction.data || []) as Record<string, unknown>[]) {
      result.set(String(row.product_id), { supplier_cost: num(row.supplier_cost), internal_margin: num(row.internal_margin), internal_notes: (row.internal_notes as string | null) ?? null })
    }
    return result
  }
  if (!isMissingFunction(viaFunction.error)) return result // not permitted or a real error: show nothing

  // Migration not applied yet: the columns are still directly readable.
  const { data } = await supabase.from('products').select('id, supplier_cost, internal_margin, internal_notes').in('id', ids.slice(0, 200))
  for (const row of (data || []) as unknown as Record<string, unknown>[]) {
    result.set(String(row.id), { supplier_cost: num(row.supplier_cost), internal_margin: num(row.internal_margin), internal_notes: (row.internal_notes as string | null) ?? null })
  }
  return result
}

/** Supplier cost of each product-supplier mapping, keyed by mapping id. Empty when the caller lacks suppliers.cost_view. */
export async function loadSupplierMappingCosts(supabase: SupabaseClient, mappingIds: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  const ids = Array.from(new Set(mappingIds.filter(Boolean)))
  if (ids.length === 0) return result

  const viaFunction = await supabase.rpc('product_supplier_costs', { p_mapping_ids: ids })
  if (!viaFunction.error) {
    for (const row of (viaFunction.data || []) as { id: string; supplier_cost: number | string | null }[]) result.set(row.id, num(row.supplier_cost))
    return result
  }
  if (!isMissingFunction(viaFunction.error)) return result

  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('product_suppliers').select('id, supplier_cost').in('id', ids.slice(i, i + 200))
    for (const row of (data || []) as { id: string; supplier_cost: number | string | null }[]) result.set(row.id, num(row.supplier_cost))
  }
  return result
}
