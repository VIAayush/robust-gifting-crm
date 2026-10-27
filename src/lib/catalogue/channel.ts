import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ids (among the given ones) of products that are B2B-only and so must never be sold through the
 * B2C store. Server-side guard for the cart and checkout. If the sales_channel column does not exist
 * yet (migration not applied) nothing is blocked, which matches the "both" default.
 */
export async function b2bOnlyProductIds(admin: SupabaseClient, productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const { data, error } = await admin.from('products').select('id, sales_channel').in('id', productIds)
  if (error) return new Set()
  return new Set((data || []).filter((row) => (row as { sales_channel?: string }).sales_channel === 'b2b').map((row) => row.id as string))
}

export type SalesChannel = 'b2b' | 'b2c' | 'both'

export function normaliseSalesChannel(value: unknown): SalesChannel {
  return value === 'b2b' || value === 'b2c' ? value : 'both'
}

/** Corporate (B2B) mode shows b2b + both; personalized (B2C store) mode shows b2c + both. */
export function visibleInMode(channel: SalesChannel, mode: 'corporate' | 'personalized') {
  return channel === 'both' || channel === (mode === 'corporate' ? 'b2b' : 'b2c')
}

export function filterProductsForMode<T extends { salesChannel: SalesChannel }>(products: T[], mode: 'corporate' | 'personalized'): T[] {
  return products.filter((product) => visibleInMode(product.salesChannel, mode))
}

