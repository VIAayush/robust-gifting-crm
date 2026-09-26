'use client'

import { useState, useTransition } from 'react'
import { assignOrderItemSupplier, updateOrderItemProcurement } from '@/app/crm/orders/actions'
import { formatCurrency } from '@/lib/utils'

const PROCUREMENT_LABELS: Record<string, string> = {
  not_assigned: 'Not assigned',
  supplier_selected: 'Supplier selected',
  po_pending: 'PO pending',
  po_raised: 'PO raised',
  confirmed: 'Confirmed',
  in_production: 'In production',
  ready: 'Ready',
  dispatched: 'Dispatched',
  received: 'Received',
  cancelled: 'Cancelled',
}
const PROCUREMENT_ORDER = Object.keys(PROCUREMENT_LABELS)
const STATUS_STYLE: Record<string, string> = {
  not_assigned: 'bg-gray-100 text-gray-500',
  supplier_selected: 'bg-blue-50 text-blue-700',
  po_pending: 'bg-amber-50 text-amber-700',
  po_raised: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  in_production: 'bg-indigo-50 text-indigo-700',
  ready: 'bg-teal-50 text-teal-700',
  dispatched: 'bg-purple-50 text-purple-700',
  received: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
}

type Row = {
  id: string
  productName: string
  supplierId: string | null
  supplierName: string | null
  supplierCostSnapshot: number | null
  supplierSkuSnapshot: string | null
  procurementStatus: string
  procurementNotes: string | null
}

export function OrderItemProcurement({
  orderId,
  items,
  suppliers,
  canAssign,
  canUpdateStatus,
  canSeeCost,
}: {
  orderId: string
  items: Row[]
  suppliers: { id: string; name: string }[]
  canAssign: boolean
  canUpdateStatus: boolean
  canSeeCost: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)

  if (!canAssign && !canUpdateStatus) return null

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
      <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">Procurement</h2>
      {error && <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-100 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-900">{item.productName}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[item.procurementStatus] || STATUS_STYLE.not_assigned}`}>
                {PROCUREMENT_LABELS[item.procurementStatus] || item.procurementStatus}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
              {canAssign ? (
                <form
                  action={(fd) => {
                    setError(null)
                    startTransition(async () => {
                      const res = await assignOrderItemSupplier(fd)
                      if (res && 'error' in res) setError(res.error)
                    })
                  }}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="order_item_id" value={item.id} />
                  <input type="hidden" name="order_id" value={orderId} />
                  <select
                    name="supplier_id"
                    defaultValue={item.supplierId || ''}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px]"
                  >
                    <option value="">No supplier assigned</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </form>
              ) : (
                <span>{item.supplierName || 'No supplier assigned'}</span>
              )}
              {item.supplierSkuSnapshot && <span className="font-mono text-gray-400">SKU {item.supplierSkuSnapshot}</span>}
              {canSeeCost && item.supplierCostSnapshot != null && <span>Cost {formatCurrency(item.supplierCostSnapshot)}</span>}
            </div>
            {canUpdateStatus && item.supplierId && (
              <form
                action={(fd) => {
                  setError(null)
                  startTransition(async () => {
                    const res = await updateOrderItemProcurement(fd)
                    if (res && 'error' in res) setError(res.error)
                    else setEditingNotesId(null)
                  })
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="order_item_id" value={item.id} />
                <input type="hidden" name="order_id" value={orderId} />
                <select name="procurement_status" defaultValue={item.procurementStatus} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px]">
                  {PROCUREMENT_ORDER.map((s) => (
                    <option key={s} value={s}>{PROCUREMENT_LABELS[s]}</option>
                  ))}
                </select>
                {editingNotesId === item.id ? (
                  <input
                    name="procurement_notes"
                    defaultValue={item.procurementNotes || ''}
                    placeholder="Internal note"
                    className="min-w-[10rem] flex-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px]"
                  />
                ) : (
                  <button type="button" onClick={() => setEditingNotesId(item.id)} className="text-[11px] text-gray-400 hover:text-gray-600">
                    {item.procurementNotes || '+ add note'}
                  </button>
                )}
                <button type="submit" disabled={pending} className="rounded-lg bg-[#9C7A33] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60">
                  Update
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
