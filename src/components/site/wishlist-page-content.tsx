'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { type WishlistItem, readWishlist, toggleWishlist, WISHLIST_EVENT } from '@/lib/site/wishlist'
import { productHrefBase } from '@/lib/site/gift-mode'
import { useGiftMode } from '@/components/site/use-gift-mode'

export function WishlistPageContent() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const mode = useGiftMode()
  const base = productHrefBase(mode)

  useEffect(() => {
    const sync = () => setItems(readWishlist())
    sync()
    setHydrated(true)
    window.addEventListener('storage', sync)
    window.addEventListener(WISHLIST_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(WISHLIST_EVENT, sync)
    }
  }, [])

  if (!hydrated) return null

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-[#E2E8F0] bg-[#F5F7FA] px-6 py-16 text-center">
        <Heart size={28} className="mx-auto text-[#9C7A33]" />
        <p className="mt-4 font-serif text-xl text-[#1B2430]">Your wishlist is empty.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#5C6570]">
          Tap the heart on any gift in the catalogue to save it here.
        </p>
        <Link
          href="/catalogue"
          className="mt-6 inline-flex bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
        >
          Browse the catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col overflow-hidden rounded-md border border-[#E2E8F0] bg-white">
            <Link href={`${base}/${item.id}`} className="relative block aspect-square catalogue-studio-field">
              <ProductImage
                src={item.image_url}
                alt={item.name}
                size="md"
                fit="contain"
                fadeEdges
                className="absolute inset-0 h-full w-full bg-transparent"
                imgClassName="catalogue-product-img"
              />
            </Link>
            <div className="flex flex-1 flex-col gap-1 p-3">
              {item.category_name ? (
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{item.category_name}</p>
              ) : null}
              <Link href={`${base}/${item.id}`} className="text-[13px] font-medium leading-snug text-[#1B2430] hover:text-[#9C7A33]">
                {item.name}
              </Link>
              <p className="text-sm font-semibold text-[#9C7A33]">{formatCurrency(item.price)}</p>
              <button
                type="button"
                onClick={() => {
                  toggleWishlist(item)
                  setItems(readWishlist())
                }}
                className="mt-auto inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 pt-2 text-[11px] font-semibold text-[#5C6570] hover:border-red-200 hover:text-red-700"
              >
                <Heart size={12} className="fill-current" />
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <Link
        href={mode === 'personalized' ? '/cart' : '/request-quote'}
        className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white sm:w-auto"
      >
        {mode === 'personalized' ? 'Go to Cart' : 'Enquire About These Gifts'}
      </Link>
    </div>
  )
}
