'use client'

import { useState } from 'react'
import { ProductGallery } from '@/components/ui/product-gallery'
import { ColorSelector } from '@/components/ui/color-selector'

type ImageLike = { url: string; alt: string }
type VariantLike = { id: string; colour: string; images: ImageLike[] }

export function ProductDetailView({
  productName,
  sharedImages,
  variants,
  galleryClassName,
}: {
  productName: string
  sharedImages: ImageLike[]
  variants: VariantLike[]
  galleryClassName?: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null)
  const selected = variants.find((v) => v.id === selectedId) || variants[0] || null
  const activeImages = selected && selected.images.length > 0 ? selected.images : sharedImages
  const galleryImages = (activeImages.length > 0 ? activeImages : sharedImages).map((img) => ({
    url: img.url,
    alt: `${productName}${selected ? ` — ${selected.colour}` : ''}`,
  }))

  return (
    <div className="space-y-4">
      <ProductGallery key={selected?.id ?? 'default'} images={galleryImages} className={galleryClassName} />
      <ColorSelector
        options={variants.map((v) => ({
          id: v.id,
          colour: v.colour,
          thumbnailUrl: v.images[0]?.url ?? sharedImages[0]?.url ?? null,
        }))}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  )
}
