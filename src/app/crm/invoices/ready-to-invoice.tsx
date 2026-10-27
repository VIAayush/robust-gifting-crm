'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvoiceFromOrder } from './actions'

export type ReadyOrder = { id: string; number: string; company: string; value: string }

export function ReadyToInvoice({ orders }: { orders: ReadyOrder[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  if (orders.length === 0) return null

  function create(id: string) {
    if (pending) return
    setBusyId(id)
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await createInvoiceFromOrder(id)
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({ kind: 'ok', text: 'Invoice created.' })
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm">
      <h2 className="mb-2 font-semibold text-gray-900">Delivered orders ready to invoice</h2>
      <ul className="divide-y divide-amber-100">
        {orders.map((order) => (
          <li key={order.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span><span className="font-mono">{order.number}</span> · {order.company} · {order.value}</span>
            <button type="button" disabled={pending} onClick={() => create(order.id)} className="min-h-9 rounded-md bg-[#9C7A33] px-3 text-xs font-semibold text-white disabled:opacity-60">
              {busyId === order.id ? 'Creating…' : 'Create invoice'}
            </button>
          </li>
        ))}
      </ul>
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p> : null}
    </section>
  )
}
