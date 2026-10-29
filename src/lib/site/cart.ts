/**
 * Public-catalogue cart — same localStorage pattern as wishlist.ts, with a
 * quantity per line. Checkout (see /checkout) now creates a real
 * storefront_checkouts/_items row and, once payment is verified, a real
 * orders/order_items row — see src/app/checkout/actions.ts.
 */
export type CartItem = {
  /** Unique per cart line (not the product id). */
  lineId: string
  id: string
  sku: string
  name: string
  price?: number | null
  image_url?: string | null
  category_name?: string | null
  variantId?: string | null
  variantColour?: string | null
  quantity: number
}

export const CART_KEY = 'robust_public_cart'
export const CART_EVENT = 'robust-cart-change'

function makeLineId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item) => item && typeof item === 'object' && (item.id || item.sku) && item.name)
      .map((item) => ({
        // Legacy rows saved before lineId existed get one assigned on read.
        lineId: typeof item.lineId === 'string' && item.lineId ? item.lineId : makeLineId(),
        id: String(item.id || item.sku),
        sku: String(item.sku || item.id),
        name: String(item.name),
        price: item.price == null ? null : Number(item.price),
        image_url: item.image_url ? String(item.image_url) : null,
        category_name: item.category_name ? String(item.category_name) : null,
        variantId: item.variantId ? String(item.variantId) : null,
        variantColour: item.variantColour ? String(item.variantColour) : null,
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      }))
  } catch {
    return []
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CART_EVENT))
}

export function cartCount() {
  return readCart().reduce((sum, item) => sum + item.quantity, 0)
}

export function cartSubtotal() {
  return readCart().reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
}

/**
 * Adds `quantity` more of this item, merging into the existing line when
 * product + variant match. Individual (B2C) orders carry no customisation, so
 * any customisation fields a caller (or an old cart) supplies are ignored.
 */
export function addToCart(item: Omit<CartItem, 'quantity' | 'lineId'>, quantity = 1) {
  const current = readCart()
  const qty = Math.max(1, Math.round(quantity) || 1)
  const clean: Omit<CartItem, 'quantity' | 'lineId'> = { ...item }
  delete (clean as Record<string, unknown>).customization
  delete (clean as Record<string, unknown>).customizationFilePath
  const existing = current.find((row) => (row.id === clean.id || row.sku === clean.sku) && (row.variantId || null) === (clean.variantId || null))
  const next = existing
    ? current.map((row) => (row === existing ? { ...row, quantity: row.quantity + qty } : row))
    : [...current, { ...clean, lineId: makeLineId(), quantity: qty }]
  writeCart(next)
}

export function updateCartQuantity(lineId: string, quantity: number) {
  const current = readCart()
  const qty = Math.max(1, Math.round(quantity) || 1)
  writeCart(current.map((row) => (row.lineId === lineId ? { ...row, quantity: qty } : row)))
}

export function removeFromCart(lineId: string) {
  const current = readCart()
  writeCart(current.filter((row) => row.lineId !== lineId))
}

export function clearCart() {
  writeCart([])
}
