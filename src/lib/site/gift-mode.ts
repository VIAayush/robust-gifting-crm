/**
 * Personalized (B2C) vs Corporate (B2B) mode — safe to import from both
 * server and client code (no next/headers here; see gift-mode-server.ts for
 * the server-side cookie read).
 */
export type GiftMode = 'personalized' | 'corporate'

export const GIFT_MODE_COOKIE = 'rg_gift_mode'

export function productHrefBase(mode: GiftMode) {
  return mode === 'personalized' ? '/personalized/product' : '/catalogue'
}

export function productHref(mode: GiftMode, productId: string) {
  return `${productHrefBase(mode)}/${productId}`
}

/** The product listing for a mode: buy-now for personalized, request-a-quote for corporate. */
export function catalogueBase(mode: GiftMode) {
  return mode === 'personalized' ? '/personalized/catalogue' : '/catalogue'
}

export function catalogueHref(mode: GiftMode, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) if (value) search.set(key, value)
  const qs = search.toString()
  return `${catalogueBase(mode)}${qs ? `?${qs}` : ''}`
}

/**
 * Pages that belong to one mode. Anything else (about, categories,
 * collections, wishlist, request-quote) is shared and follows the remembered mode cookie.
 */
export function modeForPath(pathname: string | null | undefined): GiftMode | null {
  if (!pathname) return null
  if (pathname.startsWith('/personalized') || pathname.startsWith('/cart') || pathname.startsWith('/checkout')) return 'personalized'
  if (pathname === '/' || pathname.startsWith('/home') || pathname.startsWith('/catalogue')) return 'corporate'
  return null
}

/** Where the mode switch should take you: the same kind of page in the other mode. */
export function equivalentPath(target: GiftMode, pathname: string, search = ''): string {
  const qs = search && search !== '?' ? (search.startsWith('?') ? search : `?${search}`) : ''
  const productMatch = pathname.match(/^\/(?:catalogue|personalized\/product)\/([0-9a-f-]{36})$/i)
  if (productMatch) return productHref(target, productMatch[1])
  if (pathname === '/catalogue' || pathname === '/personalized/catalogue') return `${catalogueBase(target)}${qs}`
  if (modeForPath(pathname) === null) return `${pathname}${qs}`
  return target === 'personalized' ? '/personalized' : '/'
}
