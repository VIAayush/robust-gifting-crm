import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site/site-shell'
import { ProductDetailProvider, ProductGallerySlot, ColorSelectorSlot, QuoteButtonSlot } from '@/components/site/product-detail-view'
import { WishlistHeartButton } from '@/components/site/wishlist-heart-button'
import { BulkOrderEstimator } from '@/components/site/bulk-order-estimator'
import { BrandingPreviewer } from '@/components/site/branding-previewer'
import { formatCurrency, formatUnits, isUuid } from '@/lib/utils'
import { getPublicProductWithVariants } from '@/lib/catalogue/products'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!isUuid(id)) return { title: 'Product' }
  const product = await getPublicProductWithVariants(id)
  if (!product) return { title: 'Product' }
  return {
    title: product.name,
    description: product.description || `${product.name} — Robust Gifting corporate gifting catalogue.`,
    openGraph: {
      title: `${product.name} · Robust Gifting`,
      description: product.description || 'Corporate gifting from Robust Gifting.',
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  }
}

export default async function PublicProductPage({ params }: Props) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const product = await getPublicProductWithVariants(id)
  if (!product) notFound()

  return (
    <SiteShell>
      <ProductDetailProvider productName={product.name} sharedImages={product.sharedImages} variants={product.variants}>
        <article className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-14 lg:px-8 lg:py-16">
          <div className="overflow-hidden rounded-md catalogue-studio-field">
            <ProductGallerySlot className="min-h-[16rem] h-full aspect-square bg-transparent sm:min-h-[22rem]" />
          </div>
          <div className="lg:py-4">
            {product.category_name ? (
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#5C6570]">{product.category_name}</p>
            ) : null}
            <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">{product.name}</h1>
            {product.brand_name ? <p className="mt-3 text-sm text-[#5C6570]">{product.brand_name}</p> : null}
            <p className="mt-6 text-2xl font-semibold text-[#9C7A33]">{formatCurrency(product.price)}</p>
            <p className="mt-2 text-xs text-[#5C6570]">Minimum order {formatUnits(product.moq ?? 1)}</p>

            <p className="mt-8 max-w-md text-sm leading-relaxed text-[#5C6570]">
              {product.description ||
                'Share a requirement and we will prepare a quotation with branding and packaging options.'}
            </p>

            {product.variants.length > 1 && (
              <div className="mt-8 max-w-md">
                <ColorSelectorSlot />
              </div>
            )}

            <dl className="mt-10 space-y-3 text-sm">
              <div className="flex justify-between border-b border-[#E2E8F0] py-2">
                <dt className="text-[#5C6570]">Availability</dt>
                <dd className="capitalize">{product.status === 'active' ? 'Available to quote' : product.status}</dd>
              </div>
            </dl>

            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
              <QuoteButtonSlot productId={product.id} productSku={product.sku} />
              <div className="sm:w-48">
                <WishlistHeartButton
                  variant="detail"
                  product={{
                    id: product.id,
                    sku: product.sku,
                    name: product.name,
                    price: product.price,
                    image_url: product.image_url,
                    category_name: product.category_name,
                  }}
                />
              </div>
              <Link
                href="/catalogue"
                className="inline-flex justify-center py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]"
              >
                Back to catalogue
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BulkOrderEstimator
                productId={product.id}
                productName={product.name}
                price={product.price}
                moq={product.moq ?? 1}
              />
              <BrandingPreviewer imageUrl={product.image_url} productName={product.name} />
            </div>
          </div>
        </article>
      </ProductDetailProvider>
    </SiteShell>
  )
}
