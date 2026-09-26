import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site/site-shell'
import { ProductDetailProvider, ProductGallerySlot, ColorSelectorSlot } from '@/components/site/product-detail-view'
import { PersonalizedPurchaseActions } from '@/components/site/personalized-purchase-actions'
import { isUuid } from '@/lib/utils'
import { PriceDisplay } from '@/components/site/price-display'
import { getPublicProductWithVariants } from '@/lib/catalogue/products'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!isUuid(id)) return { title: 'Gift' }
  const product = await getPublicProductWithVariants(id)
  if (!product) return { title: 'Gift' }
  return {
    title: `${product.name} — Personalized Gifts`,
    description: product.description || `${product.name} — a personalized gift from Robust Gifting.`,
    openGraph: {
      title: `${product.name} · Robust Gifting`,
      description: product.description || 'Personalized gifts from Robust Gifting.',
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  }
}

/**
 * The personalized (B2C) counterpart to /catalogue/[id] — same product data,
 * but Add to Cart + Wishlist instead of Request a Quote, and no quantity
 * selector here (that lives on /cart once the item is already in it).
 */
export default async function PersonalizedProductPage({ params }: Props) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const product = await getPublicProductWithVariants(id)
  if (!product) notFound()

  return (
    <SiteShell>
      <ProductDetailProvider productName={product.name} sharedImages={product.sharedImages} variants={product.variants}>
        <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          <Link
            href="/personalized"
            className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33] sm:mb-6"
          >
            <ArrowLeft size={14} />
            Back to Personalized Gifts
          </Link>

          <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="overflow-hidden rounded-md catalogue-studio-field lg:self-start">
              <ProductGallerySlot className="min-h-[16rem] w-full aspect-square bg-transparent sm:min-h-[22rem]" />
            </div>
            <div className="lg:py-4">
              {product.category_name ? (
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#5C6570]">{product.category_name}</p>
              ) : null}
              <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">{product.name}</h1>
              {product.brand_name ? <p className="mt-3 text-sm text-[#5C6570]">{product.brand_name}</p> : null}
              <p className="mt-2 font-mono text-[11px] tracking-wide text-[#8A94A3]">SKU {product.sku}</p>
              <PriceDisplay price={product.price} mrp={product.mrp} size="lg" className="mt-6" />

              <p className="mt-8 max-w-md text-sm leading-relaxed text-[#5C6570]">
                {product.description || 'A thoughtful gift, ready to send.'}
              </p>

              {product.variants.length > 1 && (
                <div className="mt-8 max-w-md">
                  <ColorSelectorSlot />
                </div>
              )}

              <dl className="mt-10 space-y-3 text-sm">
                <div className="flex justify-between border-b border-[#E2E8F0] py-2">
                  <dt className="text-[#5C6570]">Availability</dt>
                  <dd className="capitalize">{product.status === 'active' ? 'In stock' : product.status}</dd>
                </div>
              </dl>

              <div className="mt-8 sm:mt-10">
                <PersonalizedPurchaseActions
                  product={{
                    id: product.id,
                    sku: product.sku,
                    name: product.name,
                    price: product.price,
                    image_url: product.image_url,
                    category_name: product.category_name,
                  }}
                  customizationEnabled={product.customizationEnabled}
                  customizationFields={product.customizationFields}
                />
              </div>
            </div>
          </div>
        </article>
      </ProductDetailProvider>
    </SiteShell>
  )
}
