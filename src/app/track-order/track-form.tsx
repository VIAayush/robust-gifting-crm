'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { trackOrder, type TrackedOrder } from './actions'

const field = 'mt-2 w-full border-b border-[#E2E8F0] bg-transparent py-2 text-sm outline-none focus:border-[#9C7A33]'
const label = 'text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]'

export function TrackForm({ initialOrderNumber = '' }: { initialOrderNumber?: string }) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setOrder(null)
    startTransition(async () => {
      try {
        const result = await trackOrder(orderNumber, email)
        if ('error' in result) setError(result.error)
        else setOrder(result.order)
      } catch {
        setError('Something went wrong. Please check your connection and try again.')
      }
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div>
          <label className={label} htmlFor="track-order-number">Order number</label>
          <input id="track-order-number" className={field} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} autoComplete="off" maxLength={40} />
        </div>
        <div>
          <label className={label} htmlFor="track-email">Email used at checkout</label>
          <input id="track-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
        </div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224] disabled:opacity-60 sm:w-auto"
        >
          {pending ? 'Checking…' : 'Track order'}
        </button>
      </form>

      {order ? (
        <section aria-live="polite" className="space-y-4 rounded-md border border-[#E2E8F0] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl">{order.orderNumber}</h2>
            <span className="rounded-full bg-[#F5F7FA] px-3 py-1 text-xs font-semibold text-[#9C7A33]">{order.statusLabel}</span>
          </div>
          <p className="text-xs text-[#5C6570]">Placed on {format(new Date(order.placedOn), 'dd MMM yyyy')}</p>
          <ul className="divide-y divide-[#E7ECF3] text-sm">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">{item.description}</span>
                <span className="shrink-0 text-[#5C6570]">× {item.quantity}</span>
              </li>
            ))}
          </ul>
          {order.total !== null ? <p className="text-sm font-semibold">Total {formatCurrency(order.total)}</p> : null}
        </section>
      ) : null}
    </div>
  )
}
