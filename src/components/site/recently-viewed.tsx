'use client'

import { useEffect, useState } from 'react'
import { ProductRail } from '@/components/site/product-rail'
import type { PublicProduct } from '@/lib/catalogue/products'
import {
  RECENTLY_VIEWED_EVENT,
  readRecentlyViewed,
  recordRecentlyViewed,
  type RecentlyViewedItem,
} from '@/lib/site/recently-viewed'

/** Records the product being viewed. Renders nothing. */
export function RecentlyViewedTracker({ item }: { item: RecentlyViewedItem }) {
  const { id, sku, name, price, image_url, category_name } = item
  useEffect(() => {
    recordRecentlyViewed({ id, sku, name, price, image_url, category_name })
  }, [id, sku, name, price, image_url, category_name])
  return null
}

function toProduct(item: RecentlyViewedItem): PublicProduct {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    description: null,
    image_url: item.image_url,
    price: item.price,
    mrp: null,
    moq: null,
    category_id: null,
    category_name: item.category_name,
    brand_name: null,
    status: 'active',
    created_at: null,
    variantColours: [],
    customizationEnabled: false,
    customizationFields: [],
  }
}

/** The visitor's own recently viewed products; hidden until there is something to show. */
export function RecentlyViewedRail({ excludeId, title = 'Recently viewed' }: { excludeId?: string; title?: string }) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([])

  useEffect(() => {
    const load = () => setItems(readRecentlyViewed())
    load()
    window.addEventListener(RECENTLY_VIEWED_EVENT, load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, load)
      window.removeEventListener('storage', load)
    }
  }, [])

  const visible = items.filter((item) => item.id !== excludeId)
  if (visible.length === 0) return null

  return (
    <section aria-label={title} className="bg-white py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="store-eyebrow">{title}</p>
        <h2 className="store-section-title mt-2">Pick up where you left off.</h2>
        <div className="mt-6">
          <ProductRail products={visible.map(toProduct)} />
        </div>
      </div>
    </section>
  )
}
