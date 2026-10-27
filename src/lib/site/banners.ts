import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { audienceMatches, isBannerLive, todayInIndia, type BannerAudience } from '@/lib/site/banner-rules'

export type LiveBanner = {
  id: string
  title: string
  subtitle: string | null
  cta_label: string | null
  link_url: string | null
  image_url: string | null
  occasion: string | null
}

type Row = LiveBanner & { audience: BannerAudience; starts_on: string | null; ends_on: string | null; is_active: boolean }

async function fetchBanners(): Promise<Row[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data, error } = await admin
    .from('site_banners')
    .select('id, title, subtitle, cta_label, link_url, image_url, occasion, audience, starts_on, ends_on, is_active')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .limit(20)
  // Before the banners migration runs the table does not exist: show no banners rather than failing the page.
  if (error || !data) return []
  return data as Row[]
}

const cachedBanners = unstable_cache(fetchBanners, ['site-banners'], { revalidate: 60, tags: ['banners'] })

/** Live banners for a surface. Scheduling is evaluated per request (India date), not baked into the cache. */
export async function getLiveBanners(surface: 'public' | 'portal'): Promise<LiveBanner[]> {
  try {
    const today = todayInIndia()
    const rows = await cachedBanners()
    return rows.filter((row) => isBannerLive(row, today) && audienceMatches(row.audience, surface))
  } catch {
    return []
  }
}
