'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { type CartItem, readCart, writeCart, updateCartQuantity, removeFromCart, cartSubtotal, CART_EVENT } from '@/lib/site/cart'
import { refreshCartPrices, type CartPriceCheck } from '@/app/cart/actions'
import { formatCustomization } from '@/lib/products/customization'

const MAX_QTY = 999

/**
 * The cart is a personalized-gifts-only feature (corporate stays on its
 * existing per-product Request a Quote flow). "Place Order" hands off to
 * /checkout, which creates a real checkout + (after payment) a real order —
 * see src/app/checkout/**.
 */
export function CartPageContent() {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [check, setCheck] = useState<CartPriceCheck | null>(null)

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

  // Re-price against the database whenever the set of lines changes (not on
  // quantity changes - price per unit doesn't depend on quantity).
  const lineSignature = items.map((i) => `${i.lineId}:${i.id}:${i.variantId || ''}`).join('|')
  useEffect(() => {
    if (!hydrated || !lineSignature) return
    let cancelled = false
    const current = readCart()
    refreshCartPrices(current.map((i) => ({ lineId: i.lineId, id: i.id, variantId: i.variantId })))
      .then((result) => {
        if (cancelled) return
        setCheck(result)
        const byLine = new Map(result.lines.map((l) => [l.lineId, l]))
        const latest = readCart()
        const changed = latest.some((row) => {
          const l = byLine.get(row.lineId)
          return l?.available && l.unitPrice != null && l.unitPrice !== row.price
        })
        if (changed) {
          writeCart(latest.map((row) => {
            const l = byLine.get(row.lineId)
            return l?.available && l.unitPrice != null ? { ...row, price: l.unitPrice } : row
          }))
        }
      })
      .catch(() => {
        // Price check is advisory; checkout still re-prices server-side.
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, lineSignature])

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
  const lineStatus = new Map((check?.lines || []).map((l) => [l.lineId, l]))
  const unavailableCount = items.filter((i) => lineStatus.get(i.lineId)?.available === false).length
  const freeAbove = check?.freeDeliveryAbove ?? null
  const deliveryCharge = check ? (freeAbove != null && subtotal >= freeAbove ? 0 : check.deliveryCharge) : null
  const total = deliveryCharge != null ? subtotal + deliveryCharge : subtotal

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
              {lineStatus.get(item.lineId)?.available === false ? (
                <p role="alert" className="mt-0.5 text-xs font-medium text-red-700">
                  No longer available — please remove this item to continue.
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-[#5C6570]">
                  {formatCurrency(item.price)} each
                  {(() => {
                    const mrp = lineStatus.get(item.lineId)?.mrp
                    return mrp != null && item.price != null && mrp > item.price ? (
                      <span className="ml-1.5 text-[#8A94A3] line-through">{formatCurrency(mrp)}</span>
                    ) : null
                  })()}
                </p>
              )}
              {item.variantColour ? <p className="mt-0.5 text-xs text-[#5C6570]">Colour: {item.variantColour}</p> : null}
              {item.customization && Object.keys(item.customization).length > 0 ? (
                <p className="mt-0.5 text-xs text-[#5C6570]">
                  {formatCustomization(item.customization)}
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
                      updateCartQuantity(item.lineId, Math.min(MAX_QTY, item.quantity + 1))
                      setItems(readCart())
                    }}
                    disabled={item.quantity >= MAX_QTY}
                    className="flex h-8 w-8 items-center justify-center text-[#5C6570] hover:text-[#1B2430] disabled:opacity-40"
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
        {deliveryCharge != null ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#5C6570]">Delivery</span>
            <span className="text-[#1B2430]">{deliveryCharge > 0 ? formatCurrency(deliveryCharge) : 'Free'}</span>
          </div>
        ) : null}
        {freeAbove != null && deliveryCharge != null && deliveryCharge > 0 ? (
          <p className="text-[11px] text-[#5C6570]">
            Add {formatCurrency(Math.max(0, freeAbove - subtotal))} more for free delivery.
          </p>
        ) : null}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-sm">
          <span className="font-semibold text-[#1B2430]">Total</span>
          <span className="font-semibold text-[#1B2430]">{formatCurrency(total)}</span>
        </div>

        {unavailableCount > 0 ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-700">
            Remove {unavailableCount === 1 ? 'the unavailable item' : `the ${unavailableCount} unavailable items`} to continue.
          </p>
        ) : (
          <Link
            href="/checkout"
            className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
          >
            Proceed to Checkout
          </Link>
        )}
        <p className="text-center text-[10px] text-[#5C6570]">Final total confirmed at checkout, before payment.</p>
      </aside>
    </div>
  )
}
