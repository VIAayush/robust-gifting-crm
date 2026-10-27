import type { MetadataRoute } from 'next'
import { getPublicCatalogueProducts } from '@/lib/catalogue/products'
import { siteOrigin } from '@/lib/site/origin'

// Built per request (not at build time) so it reflects the live catalogue and never bakes in an empty list.
export const dynamic = 'force-dynamic'

const STATIC_PATHS = ['/', '/catalogue', '/personalized', '/personalized/catalogue', '/categories', '/about', '/request-quote']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin()
  // Without a known public domain there is nothing correct to publish.
  if (!origin) return []
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({ url: `${origin}${path}`, changeFrequency: 'weekly' as const }))
  try {
    const products = await getPublicCatalogueProducts()
    for (const product of products) {
      // Corporate product pages exist for every product visible to the B2B catalogue; B2C-only items live under /personalized.
      const path = product.salesChannel === 'b2c' ? `/personalized/product/${product.id}` : `/catalogue/${product.id}`
      entries.push({ url: `${origin}${path}`, changeFrequency: 'weekly' as const })
    }
  } catch {
    // Catalogue unavailable: still serve the static pages.
  }
  return entries
}
