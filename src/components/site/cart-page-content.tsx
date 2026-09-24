'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { type CartItem, readCart, updateCartQuantity, removeFromCart, cartSubtotal, CART_EVENT } from '@/lib/site/cart'

/**
 * The cart is a personalized-gifts-only feature (corporate stays on its
 * existing per-product Request a Quote flow). "Place Order" hands off to
 * /checkout, which creates a real checkout + (after payment) a real order —
 * see src/app/checkout/**.
 */
export function CartPageContent() {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const sync = () => setItems(readCart())
    sync()
    setHydrated(true)
    window.addEventListener('storage', sync)
    window.addEventListener(CART_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CART_EVENT, sync)
    }
  }, [])

  if (!hydrated) return null

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-[#E2E8F0] bg-[#F5F7FA] px-6 py-16 text-center">
        <ShoppingBag size={28} className="mx-auto text-[#9C7A33]" />
        <p className="mt-4 font-serif text-xl text-[#1B2430]">Your cart is empty.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#5C6570]">
          Add gifts from the catalogue, then come back here to place your order.
        </p>
        <Link
          href="/personalized"
          className="mt-6 inline-flex bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
        >
          Browse personalized gifts
        </Link>
      </div>
    )
  }

  const subtotal = cartSubtotal()

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.lineId} className="flex gap-4 rounded-md border border-[#E2E8F0] bg-white p-3">
            <Link href={`/personalized/product/${item.id}`} className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-md catalogue-studio-field">
              <ProductImage
                src={item.image_url}
                alt={item.name}
                size="sm"
                fit="contain"
                fadeEdges
                className="absolute inset-0 h-full w-full bg-transparent"
                imgClassName="catalogue-product-img"
              />
            </Link>
            <div className="flex flex-1 flex-col">
              {item.category_name ? (
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{item.category_name}</p>
              ) : null}
              <Link href={`/personalized/product/${item.id}`} className="text-sm font-medium text-[#1B2430] hover:text-[#9C7A33]">
                {item.name}
              </Link>
              <p className="mt-0.5 text-xs text-[#5C6570]">{formatCurrency(item.price)} each</p>
              {item.variantColour ? <p className="mt-0.5 text-xs text-[#5C6570]">Colour: {item.variantColour}</p> : null}
              {item.customization && Object.keys(item.customization).length > 0 ? (
                <p className="mt-0.5 text-xs text-[#5C6570]">
                  {Object.entries(item.customization)
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="inline-flex items-center rounded-lg border border-[#E2E8F0]">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => {
                      updateCartQuantity(item.lineId, item.quantity - 1)
                      setItems(readCart())
                    }}
                    className="flex h-8 w-8 items-center justify-center text-[#5C6570] hover:text-[#1B2430] disabled:opacity-40"
                    disabled={item.quantity <= 1}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-8 text-center text-xs">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => {
                      updateCartQuantity(item.lineId, item.quantity + 1)
                      setItems(readCart())
                    }}
                    className="flex h-8 w-8 items-center justify-center text-[#5C6570] hover:text-[#1B2430]"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    removeFromCart(item.lineId)
                    setItems(readCart())
                  }}
                  aria-label="Remove from cart"
                  className="flex h-8 w-8 items-center justify-center text-[#5C6570] hover:text-red-700"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <aside className="h-fit space-y-4 rounded-md border border-[#E2E8F0] bg-white p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#5C6570]">Subtotal</span>
          <span className="font-semibold text-[#1B2430]">{formatCurrency(subtotal)}</span>
        </div>
        <p className="text-[11px] text-[#5C6570]">Excludes delivery and customisation — confirmed with your order.</p>

        <Link
          href="/checkout"
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
        >
          Proceed to Checkout
        </Link>
        <p className="text-center text-[10px] text-[#5C6570]">Final total confirmed at checkout, before payment.</p>
      </aside>
    </div>
  )
}
