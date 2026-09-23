'use client'

import { useMemo, useState } from 'react'
import { SiteProductCard } from '@/components/site/site-product-card'
import type { PublicProduct } from '@/lib/catalogue/products'

export type GiftFinderOccasion = { slug: string; title: string; products: PublicProduct[] }

/**
 * Occasion + budget matcher over the real catalogue — no sample/placeholder
 * products. Budget bounds are derived from the actual prices passed in.
 */
export function GiftFinder({
  occasions,
  hrefBase = '/catalogue',
  eyebrow = 'Instant Matcher',
  title = 'Find the Right Gift in Seconds',
  description = 'Pick an occasion and set a budget to see matching gifts from the live catalogue.',
}: {
  occasions: GiftFinderOccasion[]
  hrefBase?: string
  eyebrow?: string
  title?: string
  description?: string
}) {
  const usable = occasions.filter((o) => o.products.length > 0)
  const allPrices = usable.flatMap((o) => o.products.map((p) => p.price || 0)).filter((p) => p > 0)
  const priceCeiling = allPrices.length ? Math.ceil(Math.max(...allPrices) / 100) * 100 : 5000
  const priceFloor = allPrices.length ? Math.floor(Math.min(...allPrices) / 100) * 100 : 0

  const [selectedSlug, setSelectedSlug] = useState<string>('all')
  const [maxBudget, setMaxBudget] = useState<number>(priceCeiling)

  const pool = useMemo(() => {
    const base = selectedSlug === 'all' ? usable.flatMap((o) => o.products) : usable.find((o) => o.slug === selectedSlug)?.products || []
    const seen = new Set<string>()
    return base.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return (p.price || 0) <= maxBudget
    })
  }, [selectedSlug, maxBudget, usable])

  if (usable.length === 0) return null

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 border-b border-[#E2E8F0] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-block rounded-full border border-[#9C7A33]/30 bg-[#9C7A33]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9C7A33]">
            {eyebrow}
          </span>
          <h2 className="mt-2 font-serif text-2xl text-[#1B2430]">{title}</h2>
          <p className="mt-1 text-xs text-[#5C6570]">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedSlug('all')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              selectedSlug === 'all' ? 'bg-[#9C7A33] text-white' : 'border border-[#E2E8F0] bg-white text-[#5C6570] hover:border-[#9C7A33]'
            }`}
          >
            All occasions
          </button>
          {usable.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => setSelectedSlug(o.slug)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                selectedSlug === o.slug ? 'bg-[#9C7A33] text-white' : 'border border-[#E2E8F0] bg-white text-[#5C6570] hover:border-[#9C7A33]'
              }`}
            >
              {o.title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-[#F5F7FA] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1B2430]">Maximum budget</span>
          <span className="text-sm font-bold text-[#9C7A33]">₹{maxBudget.toLocaleString('en-IN')}</span>
        </div>
        <input
          type="range"
          min={priceFloor}
          max={priceCeiling}
          step={Math.max(50, Math.round((priceCeiling - priceFloor) / 40 / 50) * 50)}
          value={maxBudget}
          onChange={(event) => setMaxBudget(Number(event.target.value))}
          className="mt-3 w-full accent-[#9C7A33]"
        />
      </div>

      <div className="mt-6">
        {pool.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#5C6570]">No gifts match this budget yet — try raising it.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {pool.slice(0, 8).map((product) => (
              <SiteProductCard key={product.id} product={product} hrefBase={hrefBase} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
