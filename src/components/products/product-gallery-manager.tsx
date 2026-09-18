'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from 'lucide-react'
import { ProductImage } from '@/components/ui/product-image'
import { addVariantImages, moveProductPhoto, removeProductPhoto, setPrimaryProductPhoto } from '@/app/crm/products/variant-actions'

export type ProductImageRow = {
  id: string
  variant_id: string | null
  image_url: string
  sort_order: number
  is_primary: boolean
}

export type GalleryVariant = { id: string; label: string }

export function ProductGalleryManager({
  productId,
  variants,
  images,
}: {
  productId: string
  variants: GalleryVariant[]
  images: ProductImageRow[]
}) {
  const groups: { key: string; label: string; variantId: string | null; images: ProductImageRow[] }[] = [
    { key: 'shared', label: variants.length > 0 ? 'Shared photos (all colours)' : 'Photos', variantId: null, images: [] },
    ...variants.map((v) => ({ key: v.id, label: v.label, variantId: v.id, images: [] as ProductImageRow[] })),
  ]
  const groupByKey = new Map(groups.map((g) => [g.variantId ?? 'shared', g]))
  for (const image of [...images].sort((a, b) => a.sort_order - b.sort_order)) {
    const group = groupByKey.get(image.variant_id ?? 'shared')
    if (group) group.images.push(image)
  }

  return (
    <div className="space-y-5">
      {groups
        .filter((g) => g.variantId !== null || g.images.length > 0 || variants.length === 0)
        .map((group) => (
          <GalleryGroup key={group.key} productId={productId} variantId={group.variantId} label={group.label} images={group.images} />
        ))}
    </div>
  )
}

function GalleryGroup({
  productId,
  variantId,
  label,
  images,
}: {
  productId: string
  variantId: string | null
  label: string
  images: ProductImageRow[]
}) {
  const [pending, startTransition] = useTransition()

  const onUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const data = new FormData()
    data.set('product_id', productId)
    data.set('variant_id', variantId || '')
    Array.from(files).forEach((f) => data.append('images', f))
    startTransition(async () => {
      const result = await addVariantImages(data)
      if (result?.error) toast.error(result.error)
      else toast.success('Photo(s) uploaded')
    })
  }

  const act = (fn: (formData: FormData) => Promise<{ error?: string } | undefined>, extra: Record<string, string>) => {
    const data = new FormData()
    data.set('product_id', productId)
    Object.entries(extra).forEach(([k, v]) => data.set(k, v))
    startTransition(async () => {
      const result = await fn(data)
      if (result?.error) toast.error(result.error)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-800">{label}</h3>
        <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#9C7A33] hover:text-[#7C6224]">
          <Upload size={12} /> Add photos
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            disabled={pending}
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <p className="text-[11px] text-gray-400">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image, i) => (
            <div key={image.id} className="group relative overflow-hidden rounded-lg border border-gray-200">
              <ProductImage src={image.image_url} alt={label} size="md" className="aspect-square" />
              {image.is_primary && (
                <span className="absolute left-1 top-1 rounded-full bg-[#9C7A33] px-1.5 py-0.5 text-[9px] font-bold text-white">
                  Primary
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Move earlier"
                  disabled={pending || i === 0}
                  onClick={() => act(moveProductPhoto, { image_id: image.id, direction: 'up' })}
                  className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                >
                  <ArrowLeft size={12} />
                </button>
                {!image.is_primary && (
                  <button
                    type="button"
                    title="Make primary"
                    disabled={pending}
                    onClick={() => act(setPrimaryProductPhoto, { image_id: image.id })}
                    className="rounded p-1 text-white hover:bg-white/20"
                  >
                    <Star size={12} />
                  </button>
                )}
                <button
                  type="button"
                  title="Remove"
                  disabled={pending}
                  onClick={() => act(removeProductPhoto, { image_id: image.id })}
                  className="rounded p-1 text-white hover:bg-white/20"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  type="button"
                  title="Move later"
                  disabled={pending || i === images.length - 1}
                  onClick={() => act(moveProductPhoto, { image_id: image.id, direction: 'down' })}
                  className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
