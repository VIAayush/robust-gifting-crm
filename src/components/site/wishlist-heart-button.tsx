'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { type WishlistItem, isWishlisted, toggleWishlist, WISHLIST_EVENT } from '@/lib/site/wishlist'
import { cn } from '@/lib/utils'

export function WishlistHeartButton({
  product,
  variant = 'overlay',
}: {
  product: WishlistItem
  /** 'overlay' = icon-only, sits on a product card image. 'detail' = labeled button for the product page. */
  variant?: 'overlay' | 'detail'
}) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => setActive(isWishlisted(product.id) || isWishlisted(product.sku))
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(WISHLIST_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(WISHLIST_EVENT, sync)
    }
  }, [product.id, product.sku])

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setActive(toggleWishlist(product))
  }

  if (variant === 'detail') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors',
          active
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-[#E2E8F0] bg-white text-[#9C7A33] hover:bg-[#F5F7FA]',
        )}
      >
        <Heart size={16} className={active ? 'fill-current' : ''} />
        {active ? 'Saved to wishlist' : 'Save to wishlist'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Remove from wishlist' : 'Save to wishlist'}
      className={cn(
        'absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors',
        active ? 'bg-[#9C7A33] text-white' : 'bg-white/90 text-[#9C7A33] hover:bg-white',
      )}
    >
      <Heart size={15} className={active ? 'fill-current' : ''} />
    </button>
  )
}
