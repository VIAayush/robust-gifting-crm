'use client'

import { AddToCartControl } from '@/components/site/add-to-cart-control'
import { WishlistHeartButton } from '@/components/site/wishlist-heart-button'
import { useProductDetail } from '@/components/site/product-detail-view'

type Product = {
  id: string
  sku: string
  name: string
  price: number | null
  image_url: string | null
  category_name: string | null
}

/** Add-to-cart + wishlist for the storefront product page. Individual orders carry no product options beyond colour. */
export function PersonalizedPurchaseActions({ product }: { product: Product }) {
  // The colour picked in ColorSelectorSlot (same ProductDetailProvider) must go into the cart line.
  const { variants, selectedId } = useProductDetail()
  const selectedVariant = variants.find((v) => v.id === selectedId) || variants[0] || null
  const cartProduct = {
    ...product,
    variantId: selectedVariant?.id ?? null,
    variantColour: selectedVariant?.colour ?? null,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="sm:max-w-xs sm:flex-1">
          <AddToCartControl product={cartProduct} />
        </div>
        <div className="sm:w-48">
          <WishlistHeartButton variant="detail" product={product} />
        </div>
      </div>
    </div>
  )
}
