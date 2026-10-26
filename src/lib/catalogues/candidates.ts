import type { SupabaseClient } from '@supabase/supabase-js'

export type CandidateFilter = {
  mode: 'search' | 'supplier'
  q?: string
  categoryId?: string
  minPrice?: string
  maxPrice?: string
  supplierId?: string
}

export type CandidateRow = {
  id: string
  name: string
  sku: string
  price: number | null
  image_url: string | null
  category_name: string | null
  catalogue_access: string | null
  supplierSku?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanSearch(value?: string) {
  return String(value || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80)
}

function num(value?: string) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Product ids supplied by a supplier, from product_suppliers (all mappings, not only products.supplier_id). */
async function supplierProductIds(supabase: SupabaseClient, supplierId: string) {
  const ids = new Set<string>()
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase
      .from('product_suppliers')
      .select('product_id')
      .eq('supplier_id', supplierId)
      .eq('status', 'active')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const row of data || []) ids.add(row.product_id as string)
    if (!data || data.length < 1000) break
  }
  return Array.from(ids)
}

function applyFilters<Q>(query: Q, filter: CandidateFilter): Q {
  type F = { eq: (c: string, v: string) => F; gte: (c: string, v: number) => F; lte: (c: string, v: number) => F; or: (f: string) => F }
  let q = query as unknown as F
  q = q.eq('status', 'active')
  const search = cleanSearch(filter.q)
  if (search) q = q.or(`name.ilike.*${search}*,sku.ilike.*${search}*`)
  if (filter.categoryId && UUID.test(filter.categoryId)) q = q.eq('category_id', filter.categoryId)
  const min = num(filter.minPrice)
  const max = num(filter.maxPrice)
  if (min !== null) q = q.gte('price', min)
  if (max !== null) q = q.lte('price', max)
  return q as unknown as Q
}

/** One page of candidates for the "Add products" screen, with the total match count. */
export async function searchCatalogueCandidates(
  supabase: SupabaseClient,
  filter: CandidateFilter,
  page: number,
  pageSize: number,
): Promise<{ rows: CandidateRow[]; total: number; error?: string }> {
  let restrictIds: string[] | null = null
  if (filter.mode === 'supplier') {
    if (!filter.supplierId || !UUID.test(filter.supplierId)) return { rows: [], total: 0 }
    restrictIds = await supplierProductIds(supabase, filter.supplierId)
    if (restrictIds.length === 0) return { rows: [], total: 0 }
  }

  // An id list can be long (524 for HGS), so filter it in chunks and page in memory
  // only when a supplier is chosen; the plain search pages in the database.
  if (restrictIds) {
    const matched: CandidateRow[] = []
    for (let i = 0; i < restrictIds.length; i += 300) {
      const query = applyFilters(
        supabase
          .from('products')
          .select('id, name, sku, price, image_url, catalogue_access, category:categories(name)')
          .in('id', restrictIds.slice(i, i + 300)),
        filter,
      )
      const { data, error } = await query
      if (error) return { rows: [], total: 0, error: error.message }
      for (const row of data || []) matched.push(toRow(row))
    }
    matched.sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku))
    const start = (page - 1) * pageSize
    const slice = matched.slice(start, start + pageSize)
    if (slice.length && filter.supplierId) {
      const { data: maps } = await supabase
        .from('product_suppliers')
        .select('product_id, supplier_sku')
        .eq('supplier_id', filter.supplierId)
        .in('product_id', slice.map((r) => r.id))
      const skuByProduct = new Map((maps || []).map((m) => [m.product_id as string, (m.supplier_sku as string | null) || null]))
      for (const row of slice) row.supplierSku = skuByProduct.get(row.id) ?? null
    }
    return { rows: slice, total: matched.length }
  }

  const from = (page - 1) * pageSize
  const query = applyFilters(
    supabase
      .from('products')
      .select('id, name, sku, price, image_url, catalogue_access, category:categories(name)', { count: 'exact' })
      .order('name')
      .order('id')
      .range(from, from + pageSize - 1),
    filter,
  )
  const { data, count, error } = await query
  if (error) return { rows: [], total: 0, error: error.message }
  return { rows: (data || []).map(toRow), total: count || 0 }
}

/** Every matching product id (for "add all N matching"), capped at `limit`. */
export async function findCatalogueCandidateIds(supabase: SupabaseClient, filter: CandidateFilter, limit: number): Promise<string[]> {
  let restrictIds: string[] | null = null
  if (filter.mode === 'supplier') {
    if (!filter.supplierId || !UUID.test(filter.supplierId)) return []
    restrictIds = await supplierProductIds(supabase, filter.supplierId)
  }
  const ids: string[] = []
  if (restrictIds) {
    for (let i = 0; i < restrictIds.length && ids.length < limit; i += 300) {
      const { data, error } = await applyFilters(supabase.from('products').select('id').in('id', restrictIds.slice(i, i + 300)), filter)
      if (error) throw new Error(error.message)
      for (const row of data || []) ids.push(row.id as string)
    }
    return ids.slice(0, limit)
  }
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await applyFilters(
      supabase.from('products').select('id').order('id').range(from, Math.min(from + 999, limit - 1)),
      filter,
    )
    if (error) throw new Error(error.message)
    for (const row of data || []) ids.push(row.id as string)
    if (!data || data.length < 1000) break
  }
  return ids.slice(0, limit)
}

function toRow(row: Record<string, unknown>): CandidateRow {
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  return {
    id: row.id as string,
    name: row.name as string,
    sku: row.sku as string,
    price: (row.price as number | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    category_name: (category as { name?: string } | null)?.name ?? null,
    catalogue_access: (row.catalogue_access as string | null) ?? null,
  }
}
