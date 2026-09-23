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
