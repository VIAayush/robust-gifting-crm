/**
 * Public-catalogue cart — same localStorage pattern as wishlist.ts, with a
 * quantity per line. Checkout (see /checkout) now creates a real
 * storefront_checkouts/_items row and, once payment is verified, a real
 * orders/order_items row — see src/app/checkout/actions.ts.
 */
export type CustomizationData = Record<string, string>

export type CartItem = {
  /** Unique per cart line (not the product id) — two lines can share a product+variant with different customization. */
  lineId: string
  id: string
  sku: string
  name: string
  price?: number | null
  image_url?: string | null
  category_name?: string | null
  variantId?: string | null
  variantColour?: string | null
  customization?: CustomizationData | null
  customizationFilePath?: string | null
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
        customization:
          item.customization && typeof item.customization === 'object' && !Array.isArray(item.customization)
            ? (item.customization as CustomizationData)
            : null,
        customizationFilePath: item.customizationFilePath ? String(item.customizationFilePath) : null,
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

function hasCustomization(item: { customization?: CustomizationData | null; customizationFilePath?: string | null }) {
  return Boolean(item.customizationFilePath) || Boolean(item.customization && Object.keys(item.customization).length > 0)
}

/**
 * Adds `quantity` more of this item. Merges into an existing line only when
 * product + variant match AND neither line carries customization — two
 * customized adds (even of the identical product/variant) always stay as
 * separate lines, since their customization may differ.
 */
export function addToCart(item: Omit<CartItem, 'quantity' | 'lineId'>, quantity = 1) {
  const current = readCart()
  const qty = Math.max(1, Math.round(quantity) || 1)
  const incomingCustomized = hasCustomization(item)
  const existing = !incomingCustomized
    ? current.find((row) => (row.id === item.id || row.sku === item.sku) && (row.variantId || null) === (item.variantId || null) && !hasCustomization(row))
    : undefined
  const next = existing
    ? current.map((row) => (row === existing ? { ...row, quantity: row.quantity + qty } : row))
    : [...current, { ...item, lineId: makeLineId(), quantity: qty }]
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
