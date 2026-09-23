'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { type CartItem, readCart, updateCartQuantity, removeFromCart, cartSubtotal, CART_EVENT } from '@/lib/site/cart'
import { CartOrderForm } from '@/components/site/cart-checkout-forms'

/**
 * The cart is a personalized-gifts-only feature (corporate stays on its
 * existing per-product Request a Quote flow), so there is only one
 * checkout path here — placing an order for yourself.
 */
export function CartPageContent() {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

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

  if (checkingOut) {
    return (
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => setCheckingOut(false)}
          className="mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]"
        >
          ← Back to cart
        </button>
        <h2 className="font-serif text-2xl text-[#1B2430]">Place your order</h2>
        <p className="mt-2 text-sm text-[#5C6570]">
          Share your delivery details — no payment is collected here, we will confirm the total with you first.
        </p>
        <div className="mt-6">
          <CartOrderForm items={items} />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="flex gap-4 rounded-md border border-[#E2E8F0] bg-white p-3">
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
              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="inline-flex items-center rounded-lg border border-[#E2E8F0]">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => {
                      updateCartQuantity(item.id, item.quantity - 1)
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
                      updateCartQuantity(item.id, item.quantity + 1)
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
                    removeFromCart(item.id)
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

        <button
          type="button"
          onClick={() => setCheckingOut(true)}
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
        >
          Place Order
        </button>
        <p className="text-center text-[10px] text-[#5C6570]">Any quantity — we confirm and collect payment after.</p>
      </aside>
    </div>
  )
}
