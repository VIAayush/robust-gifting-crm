/**
 * Public-catalogue cart — same localStorage pattern as wishlist.ts, with a
 * quantity per line. There is no payment processing behind this: the cart
 * feeds either a bulk-quote enquiry (corporate) or an order request that
 * staff confirm and collect payment for (personalized) — see /cart.
 */
export type CartItem = {
  id: string
  sku: string
  name: string
  price?: number | null
  image_url?: string | null
  category_name?: string | null
  quantity: number
}

export const CART_KEY = 'robust_public_cart'
export const CART_EVENT = 'robust-cart-change'

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
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

/** Adds `quantity` more of this item, merging into an existing line if already in the cart. */
export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1) {
  const current = readCart()
  const qty = Math.max(1, Math.round(quantity) || 1)
  const existing = current.find((row) => row.id === item.id || row.sku === item.sku)
  const next = existing
    ? current.map((row) => (row === existing ? { ...row, quantity: row.quantity + qty } : row))
    : [...current, { ...item, quantity: qty }]
  writeCart(next)
}

export function updateCartQuantity(idOrSku: string, quantity: number) {
  const current = readCart()
  const qty = Math.max(1, Math.round(quantity) || 1)
  writeCart(current.map((row) => (row.id === idOrSku || row.sku === idOrSku ? { ...row, quantity: qty } : row)))
}

export function removeFromCart(idOrSku: string) {
  const current = readCart()
  writeCart(current.filter((row) => row.id !== idOrSku && row.sku !== idOrSku))
}

export function clearCart() {
  writeCart([])
}
