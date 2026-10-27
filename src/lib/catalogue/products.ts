import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { oneRelation } from '@/lib/utils'
import { sortProductCategories } from '@/lib/products/categories'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normaliseSalesChannel, type SalesChannel } from '@/lib/catalogue/channel'

/**
 * Every public page (home, catalogue, categories, collections, product
 * detail) was re-running these Supabase queries - a 600+ row product fetch
 * plus a follow-up variant-colours query for the list, on every single
 * request, with zero caching anywhere in the app. That was the main cause
 * of pages and their images feeling slow to load. This is a plain
 * time-based cache (not tied to any user/session - the admin client used
 * below returns the same public catalogue for everyone), so a fresh import
 * or price edit shows up within this window rather than instantly.
 */
const CATALOGUE_REVALIDATE_SECONDS = 60

const PUBLIC_PRODUCT_SELECT_BASE =
  'id, name, sku, description, image_url, price, mrp, moq, category_id, brand_id, status, created_at, customization_enabled, customization_fields, category:categories(id, name), brand:brands(id, name)'
// sales_channel arrives with migration 20261031; until then the plain select is used and every product counts as 'both'.
const PUBLIC_PRODUCT_SELECT = `${PUBLIC_PRODUCT_SELECT_BASE}, sales_channel`

export { normaliseSalesChannel, visibleInMode, filterProductsForMode, type SalesChannel } from '@/lib/catalogue/channel'

/** Runs a products query with sales_channel selected; if the column does not exist yet, runs it again without. */
async function withChannelFallback<T>(
  run: (select: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>,
): Promise<{ data: T | null; error: { code?: string; message: string } | null }> {
  const first = await run(PUBLIC_PRODUCT_SELECT)
  if (first.error && (first.error.code === '42703' || /sales_channel/.test(first.error.message))) return run(PUBLIC_PRODUCT_SELECT_BASE)
  return first
}

export type PublicProduct = {
  id: string
  name: string
  sku: string
  description: string | null
  image_url: string | null
  price: number | null
  /** Maximum retail price. Only meaningful (and only displayed) when greater than price. */
  mrp: number | null
  moq: number | null
  category_id: string | null
  category_name: string | null
  brand_name: string | null
  status: string
  created_at: string | null
  /** Colour names available for this product, in display order. Empty when it has no colour variants. */
  variantColours: string[]
  customizationEnabled: boolean
  customizationFields: string[]
  /** Which storefronts may show this product. Defaults to 'both'. */
  salesChannel: SalesChannel
}

export type PublicProductImage = { id: string; url: string; alt: string }
export type PublicProductVariant = { id: string; colour: string; images: PublicProductImage[] }

export type PublicProductDetail = PublicProduct & {
  /** Photos shown regardless of colour (or the product's only photos, when it has no variants). */
  sharedImages: PublicProductImage[]
  variants: PublicProductVariant[]
}

type Named = { id: string; name: string }

type ProductRow = Parameters<typeof toPublicProduct>[0]

function toPublicProduct(
  row: {
    id: string
    name: string
    sku: string
    description: string | null
    image_url: string | null
    price: number | null
    mrp?: number | null
    moq: number | null
    category_id: string | null
    status: string
    created_at?: string | null
    customization_enabled?: boolean | null
    customization_fields?: string[] | null
    sales_channel?: string | null
    category?: Named | Named[] | null
    brand?: Named | Named[] | null
  },
  variantColours: string[] = [],
): PublicProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    image_url: row.image_url,
    price: row.price,
    mrp: row.mrp ?? null,
    moq: row.moq,
    category_id: row.category_id,
    category_name: oneRelation(row.category)?.name || null,
    brand_name: oneRelation(row.brand)?.name || null,
    status: row.status,
    created_at: row.created_at || null,
    variantColours,
    customizationEnabled: Boolean(row.customization_enabled),
    customizationFields: row.customization_fields || [],
    salesChannel: normaliseSalesChannel(row.sales_channel),
  }
}

async function publicDbClient(): Promise<SupabaseClient | null> {
  const admin = createAdminClient()
  if (admin) return admin
  try {
    return await createClient()
  } catch {
    return null
  }
}

/** Batch-loads {product_id: [colour, ...]} for a set of product ids, in one query. */
async function loadVariantColoursByProduct(client: SupabaseClient, productIds: string[]): Promise<Map<string, string[]>> {
  const byProduct = new Map<string, string[]>()
  if (productIds.length === 0) return byProduct
  const { data } = await client
    .from('product_variants')
    .select('product_id, colour, sort_order')
    .in('product_id', productIds)
    .eq('status', 'active')
    .order('sort_order')
  for (const row of data || []) {
    if (!row.colour) continue
    const list = byProduct.get(row.product_id) || []
    list.push(row.colour)
    byProduct.set(row.product_id, list)
  }
  return byProduct
}

/**
 * A product missing its price, category, photo, or name isn't fit to show a
 * customer — a ₹0 or imageless card is either an incomplete import or a bug,
 * never something intentional to sell. This is the single gate every public
 * listing/detail fetch below goes through, so a bad row can never reach the
 * storefront regardless of how it got into `products`.
 */
function isCatalogueReady(row: {
  name: string | null
  price: number | null
  image_url: string | null
  category?: Named | Named[] | null
}): boolean {
  return Boolean(
    row.name?.trim() && row.price !== null && row.price > 0 && row.image_url?.trim() && oneRelation(row.category)?.name,
  )
}

async function fetchPublicCatalogueProducts(): Promise<PublicProduct[]> {
  const client = await publicDbClient()
  if (!client) return []
  const { data, error } = await withChannelFallback((select) =>
    client.from('products').select(select).eq('status', 'active').eq('catalogue_access', 'all').order('name'),
  ).then((r) => ({ data: r.data as unknown as ProductRow[] | null, error: r.error }))
  if (error || !data) {
    console.error('[catalogue] public products fetch failed:', error?.message || 'no data')
    return []
  }
  const ready = data.filter(isCatalogueReady)
  const coloursByProduct = await loadVariantColoursByProduct(client, ready.map((p) => p.id))
  return ready.map((row) => toPublicProduct(row, coloursByProduct.get(row.id) || []))
}

export const getPublicCatalogueProducts = unstable_cache(fetchPublicCatalogueProducts, ['public-catalogue-products'], {
  revalidate: CATALOGUE_REVALIDATE_SECONDS,
  tags: ['catalogue'],
})

async function fetchPublicProduct(id: string): Promise<PublicProduct | null> {
  const client = await publicDbClient()
  if (!client) return null
  const { data, error } = await withChannelFallback((select) =>
    client.from('products').select(select).eq('id', id).eq('status', 'active').eq('catalogue_access', 'all').maybeSingle(),
  ).then((r) => ({ data: r.data as unknown as ProductRow | null, error: r.error }))
  if (error || !data || !isCatalogueReady(data)) return null
  const coloursByProduct = await loadVariantColoursByProduct(client, [data.id])
  return toPublicProduct(data, coloursByProduct.get(data.id) || [])
}

export const getPublicProduct = unstable_cache(fetchPublicProduct, ['public-product'], {
  revalidate: CATALOGUE_REVALIDATE_SECONDS,
  tags: ['catalogue'],
})

/** Full detail-page fetch: the product plus its colour variants and every photo, grouped by colour. */
async function fetchPublicProductWithVariants(id: string): Promise<PublicProductDetail | null> {
  const client = await publicDbClient()
  if (!client) return null
  const { data, error } = await withChannelFallback((select) =>
    client.from('products').select(select).eq('id', id).eq('status', 'active').eq('catalogue_access', 'all').maybeSingle(),
  ).then((r) => ({ data: r.data as unknown as ProductRow | null, error: r.error }))
  if (error || !data || !isCatalogueReady(data)) return null

  const [{ data: variantRows }, { data: imageRows }] = await Promise.all([
    client.from('product_variants').select('id, colour, display_name').eq('product_id', id).eq('status', 'active').order('sort_order'),
    client.from('product_images').select('id, variant_id, image_url, sort_order').eq('product_id', id).order('sort_order'),
  ])

  const imagesByVariant = new Map<string, PublicProductImage[]>()
  const sharedImages: PublicProductImage[] = []
  for (const row of imageRows || []) {
    const image = { id: row.id, url: row.image_url, alt: data.name }
    if (row.variant_id) {
      const list = imagesByVariant.get(row.variant_id) || []
      list.push(image)
      imagesByVariant.set(row.variant_id, list)
    } else {
      sharedImages.push(image)
    }
  }

  const variants: PublicProductVariant[] = (variantRows || [])
    .filter((v) => v.colour)
    .map((v) => ({
      id: v.id,
      colour: v.display_name || v.colour || '',
      images: imagesByVariant.get(v.id) || [],
    }))

  // Products created before this feature existed have zero product_images rows
  // but still carry their single legacy photo on products.image_url — fall back
  // to it so they keep working exactly as before.
  if (sharedImages.length === 0 && data.image_url) {
    sharedImages.push({ id: 'legacy', url: data.image_url, alt: data.name })
  }

  const product = toPublicProduct(data, variants.map((v) => v.colour))
  return { ...product, sharedImages, variants }
}

export const getPublicProductWithVariants = unstable_cache(fetchPublicProductWithVariants, ['public-product-variants'], {
  revalidate: CATALOGUE_REVALIDATE_SECONDS,
  tags: ['catalogue'],
})

async function fetchPublicCategories() {
  const client = await publicDbClient()
  if (!client) return []
  const { data, error } = await client.from('categories').select('id, name')
  if (error || !data) {
    console.error('[catalogue] public categories fetch failed:', error?.message || 'no data')
    return []
  }
  return sortProductCategories(data as Named[])
}

export const getPublicCategories = unstable_cache(fetchPublicCategories, ['public-categories'], {
  revalidate: CATALOGUE_REVALIDATE_SECONDS,
  tags: ['catalogue'],
})

export function sanitiseCatalogueSearch(value: string) {
  return value.replace(/[,()*]/g, ' ').trim().slice(0, 80)
}
