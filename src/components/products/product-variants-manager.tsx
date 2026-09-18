'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { addProductVariant, removeProductVariant, renameProductVariant } from '@/app/crm/products/variant-actions'
import { swatchHex } from '@/lib/products/colours'
import { ConfirmAction } from '@/components/ui/confirm-action'
import { asFormAction } from '@/lib/form-action'

export type VariantRow = {
  id: string
  colour: string | null
  display_name: string | null
  extra_price: number | null
}

export function ProductVariantsManager({ productId, variants }: { productId: string; variants: VariantRow[] }) {
  const [pending, startTransition] = useTransition()
  const [colour, setColour] = useState('')

  const onAdd = () => {
    if (!colour.trim()) {
      toast.error('Enter a colour name')
      return
    }
    const data = new FormData()
    data.set('product_id', productId)
    data.set('colour', colour)
    startTransition(async () => {
      const result = await addProductVariant(data)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setColour('')
      toast.success('Colour added')
    })
  }

  const onRename = (variantId: string, displayName: string) => {
    const data = new FormData()
    data.set('variant_id', variantId)
    data.set('product_id', productId)
    data.set('display_name', displayName)
    startTransition(async () => {
      const result = await renameProductVariant(data)
      if (result?.error) toast.error(result.error)
    })
  }

  return (
    <div className="space-y-3">
      {variants.length === 0 ? (
        <p className="text-[11px] text-gray-400">No colour variants yet. Add one below if this product comes in more than one colour.</p>
      ) : (
        <ul className="space-y-2">
          {variants.map((variant) => {
            const hex = swatchHex(variant.colour)
            return (
              <li key={variant.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-gray-300"
                  style={hex ? { backgroundColor: hex } : undefined}
                  aria-hidden="true"
                />
                <input
                  defaultValue={variant.display_name || variant.colour || ''}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== (variant.display_name || variant.colour)) onRename(variant.id, next)
                  }}
                  disabled={pending}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-white px-2 py-1 text-xs font-medium text-gray-800 focus:border-gray-200 focus:ring-1 focus:ring-[#9C7A33]"
                />
                {!!variant.extra_price && (
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {variant.extra_price > 0 ? '+' : ''}₹{variant.extra_price}
                  </span>
                )}
                <ConfirmAction
                  title="Remove this colour?"
                  confirmLabel="Remove"
                  action={asFormAction(removeProductVariant)}
                  hiddenFields={{ variant_id: variant.id, product_id: productId }}
                  description={<p>Its photos will be removed too. This can&apos;t be undone.</p>}
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-800">
                    <Trash2 size={12} />
                  </span>
                </ConfirmAction>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <input
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          placeholder="e.g. Purple"
          disabled={pending}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#9C7A33]"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#9C7A33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50"
        >
          <Plus size={12} /> Add colour
        </button>
      </div>
    </div>
  )
}
