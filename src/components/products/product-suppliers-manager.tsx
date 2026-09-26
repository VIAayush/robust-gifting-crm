'use client'

import { useState, useTransition } from 'react'
import { addProductSupplier, updateProductSupplier, setPreferredSupplier, removeProductSupplier } from '@/app/crm/products/supplier-actions'
import { ConfirmAction } from '@/components/ui/confirm-action'
import { asFormAction } from '@/lib/form-action'
import { formatCurrency } from '@/lib/utils'
import { Star } from 'lucide-react'

type Mapping = {
  id: string
  supplier_id: string
  variant_id: string | null
  supplier_name: string
  supplier_sku: string | null
  supplier_cost: number | null
  moq: number | null
  lead_time_days: number | null
  is_preferred: boolean
  status: string
}

const fieldClass = 'min-h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs'

export function ProductSuppliersManager({
  productId,
  mappings,
  suppliers,
  variants,
  canManage,
  canSeeCost,
}: {
  productId: string
  mappings: Mapping[]
  suppliers: { id: string; name: string }[]
  variants: { id: string; label: string }[]
  canManage: boolean
  canSeeCost: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const availableSuppliers = suppliers.filter((s) => !mappings.some((m) => m.supplier_id === s.id && !m.variant_id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Suppliers</h2>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-[#9C7A33] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#7C6224]"
          >
            + Add supplier
          </button>
        )}
      </div>

      {mappings.length === 0 ? (
        <p className="text-xs text-gray-400">No suppliers mapped yet. Add one so this product can be procured.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <div key={m.id} className="rounded-xl border border-gray-100 p-3">
              {editingId === m.id ? (
                <form
                  action={(fd) => {
                    setError(null)
                    startTransition(async () => {
                      const res = await updateProductSupplier(fd)
                      if (res && 'error' in res) setError(res.error)
                      else setEditingId(null)
                    })
                  }}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="product_id" value={productId} />
                  <input name="supplier_sku" defaultValue={m.supplier_sku || ''} placeholder="Supplier SKU" className={fieldClass} />
                  {canSeeCost && (
                    <input name="supplier_cost" type="number" step="0.01" min={0} defaultValue={m.supplier_cost ?? ''} placeholder="Cost" className={fieldClass} />
                  )}
                  <input name="moq" type="number" min={0} defaultValue={m.moq ?? ''} placeholder="MOQ" className={fieldClass} />
                  <input name="lead_time_days" type="number" min={0} defaultValue={m.lead_time_days ?? ''} placeholder="Lead days" className={fieldClass} />
                  <select name="status" defaultValue={m.status} className={fieldClass}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <div className="col-span-full flex gap-2">
                    <button type="submit" disabled={pending} className="rounded-lg bg-[#9C7A33] px-3 py-1.5 text-[11px] font-semibold text-white">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-[11px] text-gray-400">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    {m.is_preferred && <Star size={13} className="fill-amber-400 text-amber-400" />}
                    <span className="font-semibold text-gray-900">{m.supplier_name}</span>
                    {m.supplier_sku && <span className="font-mono text-gray-400">· {m.supplier_sku}</span>}
                    {canSeeCost && m.supplier_cost != null && <span className="text-gray-600">· {formatCurrency(m.supplier_cost)}</span>}
                    {m.moq != null && <span className="text-gray-400">· MOQ {m.moq}</span>}
                    {m.lead_time_days != null && <span className="text-gray-400">· {m.lead_time_days}d lead</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${m.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.status}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 text-[11px]">
                      {!m.is_preferred && (
                        <form action={asFormAction(setPreferredSupplier)}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="product_id" value={productId} />
                          <input type="hidden" name="variant_id" value={m.variant_id || ''} />
                          <button type="submit" className="text-[#9C7A33] hover:underline">
                            Set preferred
                          </button>
                        </form>
                      )}
                      <button type="button" onClick={() => setEditingId(m.id)} className="text-gray-500 hover:underline">
                        Edit
                      </button>
                      <ConfirmAction
                        title="Remove this supplier mapping?"
                        confirmLabel="Remove"
                        action={asFormAction(removeProductSupplier)}
                        hiddenFields={{ id: m.id, product_id: productId }}
                        description={<p>Historical orders keep their own cost snapshot and are unaffected.</p>}
                      >
                        Remove
                      </ConfirmAction>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form
          action={(fd) => {
            setError(null)
            startTransition(async () => {
              const res = await addProductSupplier(fd)
              if (res && 'error' in res) setError(res.error)
              else setAdding(false)
            })
          }}
          className="space-y-2 rounded-xl border border-dashed border-[#9C7A33]/40 p-3"
        >
          <input type="hidden" name="product_id" value={productId} />
          {error && <p className="rounded bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select name="supplier_id" required className={fieldClass}>
              <option value="">Select supplier</option>
              {availableSuppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {variants.length > 0 && (
              <select name="variant_id" className={fieldClass}>
                <option value="">Applies to whole product</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            )}
            <input name="supplier_sku" placeholder="Supplier SKU" className={fieldClass} />
            {canSeeCost && <input name="supplier_cost" type="number" step="0.01" min={0} placeholder="Cost" className={fieldClass} />}
            <input name="moq" type="number" min={0} placeholder="MOQ" className={fieldClass} />
            <input name="lead_time_days" type="number" min={0} placeholder="Lead time (days)" className={fieldClass} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-[#9C7A33] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60">
              {pending ? 'Saving…' : 'Add'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-gray-400">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
