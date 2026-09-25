'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, List } from 'lucide-react'
import { SiteProductCard } from '@/components/site/site-product-card'
import { formatCurrency } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import type { PublicProduct } from '@/lib/catalogue/products'

const VIEW_KEY = 'giffter.public-catalogue.view'

// This page has no server-side pagination, so without a render cap every
// filtered product's photo gets mounted (and, for anything near the top of
// the scroll, fetched) on a single page load. Cap what's in the DOM up front
// and reveal the rest on demand instead - the full filtered list is already
// in memory, so "Load More" is just raising this count, no extra fetch.
const INITIAL_VISIBLE = 36
const LOAD_MORE_STEP = 36

export function CatalogueBrowser({ products, hrefBase = '/catalogue' }: { products: PublicProduct[]; hrefBase?: string }) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [renderedProducts, setRenderedProducts] = useState(products)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY)
      if (saved === 'list' || saved === 'grid') setView(saved)
    } catch {
      // Preference is optional.
    }
  }, [])

  // A new filtered/sorted product list (different search params) should start
  // back at the top instead of staying scrolled open to whatever count the
  // previous filter had reached. Adjusted during render (React's documented
  // pattern for this) rather than an effect, so it lands before paint.
  if (products !== renderedProducts) {
    setRenderedProducts(products)
    setVisibleCount(INITIAL_VISIBLE)
  }

  const choose = (next: 'grid' | 'list') => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Ignore storage failures.
    }
  }

  if (products.length === 0) {
    return <p className="py-20 text-center text-sm text-[#5C6570]">No gifts match these filters.</p>
  }

  const visibleProducts = products.slice(0, visibleCount)
  const hasMore = visibleCount < products.length

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <div className="inline-flex overflow-hidden rounded-md border border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => choose('grid')}
            aria-pressed={view === 'grid'}
            className={`inline-flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] ${
              view === 'grid' ? 'bg-[#9C7A33] text-white' : 'bg-white text-[#5C6570]'
            }`}
          >
            <LayoutGrid size={13} /> Grid
          </button>
          <button
            type="button"
            onClick={() => choose('list')}
            aria-pressed={view === 'list'}
            className={`inline-flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] ${
              view === 'list' ? 'bg-[#9C7A33] text-white' : 'bg-white text-[#5C6570]'
            }`}
          >
            <List size={13} /> List
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((product) => (
            <SiteProductCard key={product.id} product={product} hrefBase={hrefBase} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
          {visibleProducts.map((product) => (
            <Link
              key={product.id}
              href={`${hrefBase}/${product.id}`}
              className="grid grid-cols-[5rem_1fr_auto] items-center gap-4 py-4 text-inherit hover:text-inherit sm:grid-cols-[6.5rem_1fr_auto] sm:gap-5"
            >
              <div className="relative aspect-square overflow-hidden rounded-md catalogue-studio-field">
                <ProductImage
                  src={product.image_url}
                  alt={product.name}
                  size="sm"
                  fit="contain"
                  fadeEdges
                  className="absolute inset-0 h-full w-full bg-transparent"
                  imgClassName="catalogue-product-img"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#5C6570]">{product.category_name}</p>
                <p className="mt-1 truncate font-medium text-[#1B2430]">{product.name}</p>
                <p className="mt-1 font-mono text-[10px] text-[#5C6570]">{product.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#9C7A33]">{formatCurrency(product.price)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#5C6570]">View</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
            className="inline-flex items-center justify-center border border-[#E2E8F0] px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1B2430] transition-shadow hover:shadow-[0_4px_14px_rgba(27,36,48,0.08)]"
          >
            Load more gifts
          </button>
        </div>
      ) : null}
    </div>
  )
}
