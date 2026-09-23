/**
 * Public-catalogue wishlist — same localStorage pattern as the client portal's
 * shortlist (src/lib/portal/catalogue-shortlist.ts), kept separate because this
 * one is for unauthenticated visitors browsing the public site, not signed-in
 * portal clients.
 */
export type WishlistItem = {
  id: string
  sku: string
  name: string
  price?: number | null
  image_url?: string | null
  category_name?: string | null
}

export const WISHLIST_KEY = 'robust_public_wishlist'
export const WISHLIST_EVENT = 'robust-wishlist-change'

export function readWishlist(): WishlistItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item) => item && typeof item === 'object' && (item.id || item.sku) && item.name)
      .map((item) => ({
        id: String(item.id || item.sku),
        sku: String(item.sku || item.id),
        name: String(item.name),
        price: item.price == null ? null : Number(item.price),
        image_url: item.image_url ? String(item.image_url) : null,
        category_name: item.category_name ? String(item.category_name) : null,
      }))
  } catch {
    return []
  }
}

export function writeWishlist(items: WishlistItem[]) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(WISHLIST_EVENT))
}

export function isWishlisted(idOrSku: string) {
  const needle = String(idOrSku)
  return readWishlist().some((item) => item.id === needle || item.sku === needle)
}

export function toggleWishlist(item: WishlistItem) {
  const current = readWishlist()
  const exists = current.some((row) => row.id === item.id || row.sku === item.sku)
  const next = exists
    ? current.filter((row) => row.id !== item.id && row.sku !== item.sku)
    : [...current, item]
  writeWishlist(next)
  return !exists
}
