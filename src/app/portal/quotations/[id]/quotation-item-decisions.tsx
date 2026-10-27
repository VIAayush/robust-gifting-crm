'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToQuotationItems } from '../../actions'
import { acceptedTotals, overallOutcome } from '@/lib/quotations/decisions'
import { formatCurrency } from '@/lib/utils'

export type DecisionItem = { id: string; name: string; sku: string | null; quantity: number; unitPrice: number }

export function QuotationItemDecisions({
  quotationId,
  items,
  discountPercent,
  taxPercent,
}: {
  quotationId: string
  items: DecisionItem[]
  discountPercent: number
  taxPercent: number
}) {
  const router = useRouter()
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(items.map((i) => i.id)))
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const totals = useMemo(
    () => acceptedTotals(items.map((i) => ({ id: i.id, quantity: i.quantity, unitPrice: i.unitPrice })), accepted, discountPercent, taxPercent),
    [items, accepted, discountPercent, taxPercent],
  )
  const decisions = items.map((i) => ({ itemId: i.id, accept: accepted.has(i.id) }))
  const outcome = overallOutcome(decisions)

  function set(id: string, accept: boolean) {
    setAccepted((current) => {
      const next = new Set(current)
      if (accept) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function submit() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await respondToQuotationItems(quotationId, decisions, comment)
      if (result && 'error' in result && result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    } catch {
      setError('We could not record your decision. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 border-t border-gray-200 pt-8">
      <h3 className="mb-1 text-lg font-semibold text-gray-900">Your decision, item by item</h3>
      <p className="mb-4 text-xs text-gray-500">Accept the items you want and reject the rest. Only accepted items go into your order.</p>
      {error ? <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-2">
        {items.map((item) => {
          const isAccepted = accepted.has(item.id)
          return (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.sku ? `${item.sku} · ` : ''}Qty {item.quantity} × {formatCurrency(item.unitPrice)}
                </p>
              </div>
              <div role="group" aria-label={`Decision for ${item.name}`} className="flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-pressed={isAccepted}
                  onClick={() => set(item.id, true)}
                  className={`min-h-10 rounded-lg border px-4 text-xs font-semibold ${isAccepted ? 'border-green-700 bg-green-700 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Accept
                </button>
                <button
                  type="button"
                  aria-pressed={!isAccepted}
                  onClick={() => set(item.id, false)}
                  className={`min-h-10 rounded-lg border px-4 text-xs font-semibold ${!isAccepted ? 'border-red-700 bg-red-700 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Reject
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-lg bg-[#F5F7FA] p-3 text-sm">
        <p className="flex justify-between"><span className="text-gray-600">Accepted items</span><strong>{accepted.size} of {items.length}</strong></p>
        <p className="mt-1 flex justify-between"><span className="text-gray-600">Total for accepted items (incl. tax)</span><strong className="text-[#9C7A33]">{formatCurrency(totals.total)}</strong></p>
      </div>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Comment for our team (optional)
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-[#9C7A33]" />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 py-2 font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50 sm:w-auto"
      >
        {loading ? 'Submitting…' : outcome === 'rejected' ? 'Reject quotation' : outcome === 'accepted' ? 'Accept all items' : `Accept ${accepted.size} of ${items.length} items`}
      </button>
    </div>
  )
}
