'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { saveProductCustomization } from '@/app/crm/products/actions'
import { CUSTOMIZATION_FIELDS } from '@/lib/products/customization'

export function ProductCustomizationEditor({
  productId,
  initialEnabled,
  initialFields,
}: {
  productId: string
  initialEnabled: boolean
  initialFields: string[]
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [fields, setFields] = useState<string[]>(initialFields)
  const [pending, startTransition] = useTransition()

  const toggleField = (key: string) => {
    setFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]))
  }

  const save = () => {
    startTransition(async () => {
      const result = await saveProductCustomization(productId, enabled, fields)
      if (result?.error) {
        toast.error('Unable to update customization. Please try again.')
        return
      }
      toast.success('Customization settings updated')
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Customization</h2>
        <p className="text-xs text-gray-500 mt-0.5">Let personalized-gifts shoppers customize this product before checkout.</p>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-gray-800">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Customization available
      </label>

      {enabled && (
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {CUSTOMIZATION_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={fields.includes(field.key)} onChange={() => toggleField(field.key)} />
              {field.label}
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="px-4 py-2 text-xs font-semibold text-white bg-[#9C7A33] hover:bg-[#7C6224] hover:text-white rounded-lg disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save customization'}
      </button>
    </div>
  )
}
