import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankByActivity } from '@/lib/catalogue/trending'

const WINDOW_DAYS = 90

async function fetchTrendingIds(): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const [orders, interests] = await Promise.all([
    admin
      .from('order_items')
      .select('product_id, order:orders!inner(status, created_at)')
      .neq('order.status', 'cancelled')
      .gte('order.created_at', since)
      .limit(5000),
    admin.from('company_product_interests').select('product_id').gte('created_at', since).limit(5000),
  ])
  // Either source failing (or being empty) simply means less activity: the caller falls back to curation.
  const orderIds = orders.error ? [] : (orders.data || []).map((row) => row.product_id as string)
  const interestIds = interests.error ? [] : (interests.data || []).map((row) => row.product_id as string)
  return rankByActivity(orderIds, interestIds, 30)
}

export const getTrendingProductIds = unstable_cache(fetchTrendingIds, ['trending-product-ids'], { revalidate: 3600, tags: ['catalogue'] })
