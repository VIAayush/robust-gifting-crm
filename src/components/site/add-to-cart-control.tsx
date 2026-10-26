'use client'

import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { addToCart, type CartItem, type CustomizationData } from '@/lib/site/cart'
import { notifyCartAdded } from '@/components/site/cart-toast'

type ProductInput = Omit<CartItem, 'quantity' | 'lineId'>

/** Adds one unit to the cart; quantity is adjusted afterwards on /cart. Confirmation shows in the shared CartToast. */
export function AddToCartControl({
  product,
  customization,
  customizationFilePath,
}: {
  product: Omit<ProductInput, 'customization' | 'customizationFilePath'>
  /** Current values from ProductCustomizer, if the product has customization enabled. */
  customization?: CustomizationData | null
  customizationFilePath?: string | null
}) {
  const [added, setAdded] = useState(false)
  const timer = useRef<number | null>(null)

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        addToCart({ ...product, customization: customization || null, customizationFilePath: customizationFilePath || null }, 1)
        notifyCartAdded({ name: product.name, quantity: 1, image_url: product.image_url, colour: product.variantColour || null })
        setAdded(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setAdded(false), 1600)
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
    >
      {added ? (
        <>
          <Check size={14} /> Added
        </>
      ) : (
        'Add to Cart'
      )}
    </button>
  )
}
