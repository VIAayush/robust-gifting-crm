import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE = 1000

/**
 * Every product row (paged past PostgREST's 1,000-row cap), for pickers that
 * must offer the whole catalogue. Runs under the caller's RLS.
 */
export async function fetchAllProducts<T = { id: string; name: string; sku: string }>(
  supabase: SupabaseClient,
  columns = 'id, name, sku',
  options: { activeOnly?: boolean } = { activeOnly: true },
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 50_000; from += PAGE) {
    let query = supabase.from('products').select(columns).order('name').order('id').range(from, from + PAGE - 1)
    if (options.activeOnly) query = query.eq('status', 'active')
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows.push(...((data || []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}
