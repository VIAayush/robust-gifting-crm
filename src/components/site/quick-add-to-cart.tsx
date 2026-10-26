'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { addToCart } from '@/lib/site/cart'
import { notifyCartAdded } from '@/components/site/cart-toast'
import type { PublicProduct } from '@/lib/catalogue/products'

const buttonClass =
  'inline-flex min-h-10 w-full items-center justify-center gap-1.5 border px-3 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors'

/** Catalogue-grid buy button for the personalized (B2C) storefront. */
export function QuickAddToCart({ product, productHref }: { product: PublicProduct; productHref: string }) {
  const [added, setAdded] = useState(false)
  const timer = useRef<number | null>(null)

  if (!product.price || product.price <= 0) {
    return (
      <Link href={productHref} className={`${buttonClass} border-[#E2E8F0] text-[#5C6570] hover:text-[#1B2430]`}>
        View details
      </Link>
    )
  }

  // A product with several colours needs the colour picked on its own page first.
  if (product.variantColours.length > 1) {
    return (
      <Link href={productHref} className={`${buttonClass} border-[#9C7A33] text-[#9C7A33] hover:bg-[#FBF8F2]`}>
        Choose colour
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        addToCart(
          {
            id: product.id,
            sku: product.sku,
            name: product.name,
            price: product.price,
            image_url: product.image_url,
            category_name: product.category_name,
          },
          1,
        )
        notifyCartAdded({ name: product.name, quantity: 1, image_url: product.image_url })
        setAdded(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setAdded(false), 1600)
      }}
      className={`${buttonClass} border-[#9C7A33] bg-[#9C7A33] text-white hover:bg-[#7C6224]`}
    >
      {added ? (
        <>
          <Check size={13} /> Added
        </>
      ) : (
        'Add to Cart'
      )}
    </button>
  )
}
