'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import {
  type CatalogueShortlistItem,
  isCatalogueShortlisted,
  toggleCatalogueShortlist,
} from '@/lib/portal/catalogue-shortlist'

export function CatalogueShortlistButton({
  product,
  variant = 'card',
}: {
  product: CatalogueShortlistItem
  variant?: 'card' | 'detail'
}) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () => setActive(isCatalogueShortlisted(product.id) || isCatalogueShortlisted(product.sku))
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('giffter-shortlist-change', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('giffter-shortlist-change', sync)
    }
  }, [product.id, product.sku])

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const next = toggleCatalogueShortlist(product)
        setActive(next)
      }}
      className={
        variant === 'detail'
          ? `inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
              active
                ? 'border border-green-200 bg-green-50 text-green-800'
                : 'bg-[#C9A84C] text-white hover:bg-[#A87C2A]'
            }`
          : `inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              active
                ? 'border border-green-200 bg-green-50 text-green-800'
                : 'border border-[#E2E8F0] bg-white text-[#C9A84C] hover:bg-[#F5F7FA]'
            }`
      }
      aria-pressed={active}
    >
      <Heart size={14} className={active ? 'fill-current' : ''} />
      {active ? 'Shortlisted' : 'Shortlist'}
    </button>
  )
}
