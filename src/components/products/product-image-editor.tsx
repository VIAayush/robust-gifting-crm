'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ProductImage } from '@/components/ui/product-image'
import { uploadProductImage, removeProductImage } from '@/app/crm/products/actions'

export function ProductImageEditor({
  productId,
  imageUrl,
  name,
}: {
  productId: string
  imageUrl: string | null
  name: string
}) {
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)

  const onFile = (file: File | null) => {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    const data = new FormData()
    data.set('product_id', productId)
    data.set('image', file)
    startTransition(async () => {
      const result = await uploadProductImage(data)
      if (result?.error) {
        setPreview(null)
        toast.error(result.error)
        return
      }
      toast.success('Product image updated')
    })
  }

  const onRemove = () => {
    const data = new FormData()
    data.set('product_id', productId)
    startTransition(async () => {
      const result = await removeProductImage(data)
      setPreview(null)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Product image removed')
    })
  }

  return (
    <div className="space-y-3">
      <ProductImage src={preview || imageUrl} alt={name} size="lg" className="rounded-xl border border-gray-200" />
      <div className="flex flex-wrap gap-2">
        <label className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 cursor-pointer">
          {imageUrl ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-red-700 hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400">JPG, PNG or WebP. Max 5 MB.</p>
    </div>
  )
}
