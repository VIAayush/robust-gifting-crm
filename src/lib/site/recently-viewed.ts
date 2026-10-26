/**
 * "Recently viewed" products, kept in the visitor's own browser (localStorage)
 * like the public wishlist. Only public-catalogue fields are stored — no cost,
 * supplier or margin data ever reaches the browser through this list.
 */
export type RecentlyViewedItem = {
  id: string
  sku: string
  name: string
  price: number | null
  image_url: string | null
  category_name: string | null
}

export const RECENTLY_VIEWED_KEY = 'robust_recently_viewed'
export const RECENTLY_VIEWED_EVENT = 'robust-recently-viewed-change'
export const RECENTLY_VIEWED_LIMIT = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Defensive parse: anything malformed (older versions, hand-edited storage) is dropped. */
export function parseRecentlyViewed(raw: unknown): RecentlyViewedItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const items: RecentlyViewedItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const id = String(item.id || '')
    const name = String(item.name || '').trim()
    if (!UUID_RE.test(id) || !name || seen.has(id)) continue
    seen.add(id)
    const price = item.price == null ? null : Number(item.price)
    items.push({
      id,
      sku: String(item.sku || ''),
      name: name.slice(0, 200),
      price: price !== null && Number.isFinite(price) ? price : null,
      image_url: typeof item.image_url === 'string' && item.image_url ? item.image_url : null,
      category_name: typeof item.category_name === 'string' && item.category_name ? item.category_name : null,
    })
    if (items.length >= RECENTLY_VIEWED_LIMIT) break
  }
  return items
}

/** Most recent first, de-duplicated, capped. Pure so it can be unit-tested. */
export function pushRecentlyViewed(current: RecentlyViewedItem[], item: RecentlyViewedItem): RecentlyViewedItem[] {
  return [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, RECENTLY_VIEWED_LIMIT)
}

export function readRecentlyViewed(): RecentlyViewedItem[] {
  if (typeof window === 'undefined') return []
  try {
    return parseRecentlyViewed(JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]'))
  } catch {
    return []
  }
}

export function recordRecentlyViewed(item: RecentlyViewedItem) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(pushRecentlyViewed(readRecentlyViewed(), item)))
    window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT))
  } catch {
    // Private mode / storage full: the feature is a convenience, never an error.
  }
}
