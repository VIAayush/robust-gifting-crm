'use client'

import { useState } from 'react'
import { AddToCartControl } from '@/components/site/add-to-cart-control'
import { ProductCustomizer } from '@/components/site/product-customizer'
import { WishlistHeartButton } from '@/components/site/wishlist-heart-button'
import type { CustomizationData } from '@/lib/site/cart'

type Product = {
  id: string
  sku: string
  name: string
  price: number | null
  image_url: string | null
  category_name: string | null
}

/**
 * Holds the customization state shared between ProductCustomizer and
 * AddToCartControl — both are client components on the personalized product
 * page and need to agree on what gets added to the cart.
 */
export function PersonalizedPurchaseActions({
  product,
  customizationEnabled,
  customizationFields,
}: {
  product: Product
  customizationEnabled: boolean
  customizationFields: string[]
}) {
  const [customization, setCustomization] = useState<CustomizationData>({})
  const [customizationFilePath, setCustomizationFilePath] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {customizationEnabled ? (
        <ProductCustomizer
          productId={product.id}
          enabledFields={customizationFields}
          onChange={(data) => {
            setCustomization(data.customization)
            setCustomizationFilePath(data.customizationFilePath)
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="sm:max-w-xs sm:flex-1">
          <AddToCartControl product={product} customization={customization} customizationFilePath={customizationFilePath} />
        </div>
        <div className="sm:w-48">
          <WishlistHeartButton variant="detail" product={product} />
        </div>
      </div>
    </div>
  )
}
