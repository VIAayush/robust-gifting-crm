'use client'

import { useState } from 'react'
import Link from 'next/link'
import { addToCart, type CartItem } from '@/lib/site/cart'

/** Adds one unit to the cart — quantity is adjusted afterwards on /cart, not here. */
export function AddToCartControl({ product }: { product: Omit<CartItem, 'quantity'> }) {
  const [added, setAdded] = useState(false)

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          addToCart(product, 1)
          setAdded(true)
          window.setTimeout(() => setAdded(false), 2200)
        }}
        className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
      >
        Add to Cart
      </button>
      {added ? (
        <p className="text-xs text-green-700">
          Added to cart. <Link href="/cart" className="font-semibold underline">View cart</Link>
        </p>
      ) : null}
    </div>
  )
}
