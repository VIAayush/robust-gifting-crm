'use client'

import { useState } from 'react'
import { CUSTOMIZATION_FIELDS } from '@/lib/products/customization'
import { uploadCustomizationFile } from '@/app/personalized/customization-actions'
import type { CustomizationData } from '@/lib/site/cart'

const inputClass = 'mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#9C7A33]'

/**
 * Shown on the product page when the product has customization enabled.
 * Renders only the fields that product turned on. Values flow up to the
 * parent (which passes them into AddToCartControl) via onChange.
 */
export function ProductCustomizer({
  productId,
  enabledFields,
  onChange,
}: {
  productId: string
  enabledFields: string[]
  onChange: (data: { customization: CustomizationData; customizationFilePath: string | null }) => void
}) {
  const [values, setValues] = useState<CustomizationData>({})
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const fields = CUSTOMIZATION_FIELDS.filter((f) => enabledFields.includes(f.key))
  if (fields.length === 0) return null

  const setValue = (key: string, value: string) => {
    const next = { ...values, [key]: value }
    setValues(next)
    onChange({ customization: next, customizationFilePath: filePath })
  }

  return (
    <div className="rounded-md border border-[#E2E8F0] bg-[#F5F7FA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1B2430]">Customize this product</p>
      <div className="mt-3 space-y-3">
        {fields.map((field) => {
          if (field.type === 'file') {
            return (
              <label key={field.key} className="block">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]">{field.label}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="mt-1 block w-full text-xs"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    setUploading(true)
                    setUploadError('')
                    const form = new FormData()
                    form.set('product_id', productId)
                    form.set('file', file)
                    const result = await uploadCustomizationFile(form)
                    setUploading(false)
                    if (result.error) {
                      setUploadError(result.error)
                      return
                    }
                    setFilePath(result.path || null)
                    setFileName(file.name)
                    onChange({ customization: values, customizationFilePath: result.path || null })
                  }}
                />
                {uploading ? <p className="mt-1 text-[11px] text-[#5C6570]">Uploading…</p> : null}
                {fileName && !uploading ? <p className="mt-1 text-[11px] text-green-700">Uploaded: {fileName}</p> : null}
                {uploadError ? <p className="mt-1 text-[11px] text-red-700">{uploadError}</p> : null}
              </label>
            )
          }
          if (field.type === 'textarea') {
            return (
              <label key={field.key} className="block">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]">{field.label}</span>
                <textarea rows={2} className={inputClass} onChange={(event) => setValue(field.key, event.target.value)} />
              </label>
            )
          }
          return (
            <label key={field.key} className="block">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]">{field.label}</span>
              <input type="text" maxLength={80} className={inputClass} onChange={(event) => setValue(field.key, event.target.value)} />
            </label>
          )
        })}
      </div>
    </div>
  )
}
