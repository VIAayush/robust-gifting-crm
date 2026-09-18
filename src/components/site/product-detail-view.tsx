'use client'

import { createContext, useContext, useState } from 'react'
import { ProductGallery } from '@/components/ui/product-gallery'
import { ColorSelector } from '@/components/ui/color-selector'
import { QuoteRequestModal } from '@/components/site/quote-request-modal'

type ImageLike = { url: string; alt: string }
type VariantLike = { id: string; colour: string; images: ImageLike[] }

type ProductDetailState = {
  productName: string
  sharedImages: ImageLike[]
  variants: VariantLike[]
  selectedId: string | null
  setSelectedId: (id: string) => void
}

const ProductDetailContext = createContext<ProductDetailState | null>(null)

function useProductDetail() {
  const ctx = useContext(ProductDetailContext)
  if (!ctx) throw new Error('ProductGallerySlot/ColorSelectorSlot must be used inside a ProductDetailProvider')
  return ctx
}

/**
 * Holds the selected-colour state so the gallery and the colour selector can
 * be placed anywhere in the page layout (they don't have to be next to each
 * other) while staying in sync.
 */
export function ProductDetailProvider({
  productName,
  sharedImages,
  variants,
  children,
}: {
  productName: string
  sharedImages: ImageLike[]
  variants: VariantLike[]
  children: React.ReactNode
}) {
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null)
  return (
    <ProductDetailContext.Provider value={{ productName, sharedImages, variants, selectedId, setSelectedId }}>
      {children}
    </ProductDetailContext.Provider>
  )
}

export function ProductGallerySlot({ className }: { className?: string }) {
  const { productName, sharedImages, variants, selectedId } = useProductDetail()
  const selected = variants.find((v) => v.id === selectedId) || variants[0] || null
  const activeImages = selected && selected.images.length > 0 ? selected.images : sharedImages
  const galleryImages = (activeImages.length > 0 ? activeImages : sharedImages).map((img) => ({
    url: img.url,
    alt: `${productName}${selected ? ` — ${selected.colour}` : ''}`,
  }))
  return <ProductGallery key={selected?.id ?? 'default'} images={galleryImages} className={className} />
}

/** "Request a Quote" button + modal, carrying whichever colour is currently selected. */
export function QuoteButtonSlot({ productId, productSku }: { productId: string; productSku: string }) {
  const { productName, variants, selectedId } = useProductDetail()
  const selected = variants.find((v) => v.id === selectedId) || variants[0] || null
  return (
    <QuoteRequestModal
      productId={productId}
      productName={productName}
      productSku={productSku}
      variantColour={selected?.colour ?? null}
    />
  )
}

export function ColorSelectorSlot() {
  const { variants, sharedImages, selectedId, setSelectedId } = useProductDetail()
  return (
    <ColorSelector
      options={variants.map((v) => ({
        id: v.id,
        colour: v.colour,
        thumbnailUrl: v.images[0]?.url ?? sharedImages[0]?.url ?? null,
      }))}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  )
}
