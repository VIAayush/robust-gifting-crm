'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPayable, recordPayablePayment } from './actions'

const input = 'mt-1 w-full rounded-md border px-2 py-1.5 text-xs'

type Result = { success: true } | { error: string }

function useRunner() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  function run(task: () => Promise<Result>, ok: string, after?: () => void) {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await task()
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({ kind: 'ok', text: ok })
          after?.()
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }
  return { pending, message, run }
}

export function NewPayableForm() {
  const { pending, message, run } = useRunner()
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 rounded-lg border bg-white p-4 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-[#9C7A33]">{open ? 'Hide form' : 'Add a payable'}</button>
      {open ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            run(() => createPayable(new FormData(form)), 'Payable added.', () => form.reset())
          }}
        >
          <label className="font-medium text-gray-700">Vendor type
            <select name="vendor_type" className={input} defaultValue="supplier">
              <option value="supplier">Supplier</option><option value="printing">Printing vendor</option><option value="courier">Courier</option><option value="sample">Samples</option><option value="other">Other</option>
            </select>
          </label>
          <label className="font-medium text-gray-700">Vendor name<input name="vendor_name" className={input} maxLength={120} required /></label>
          <label className="font-medium text-gray-700">Amount (₹)<input name="amount" className={input} inputMode="decimal" required /></label>
          <label className="font-medium text-gray-700">Due date<input name="due_date" type="date" className={input} /></label>
          <label className="font-medium text-gray-700">Order number (optional)<input name="order_number" className={input} maxLength={40} /></label>
          <label className="font-medium text-gray-700">Notes<input name="notes" className={input} maxLength={1000} /></label>
          <div className="sm:col-span-3"><button disabled={pending} className="min-h-9 rounded-md bg-[#9C7A33] px-4 font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save payable'}</button></div>
        </form>
      ) : null}
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p> : null}
    </div>
  )
}

export function PayPayableForm({ id, outstanding }: { id: string; outstanding: number }) {
  const { pending, message, run } = useRunner()
  const [amount, setAmount] = useState('')
  if (outstanding <= 0) return null
  return (
    <div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData()
          data.set('id', id)
          data.set('payment', amount)
          run(() => recordPayablePayment(data), 'Payment recorded.', () => setAmount(''))
        }}
      >
        <input aria-label="Payment amount" className="w-24 rounded-md border px-2 py-1 text-xs" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button disabled={pending || !amount} className="rounded-md border px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Pay</button>
      </form>
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-1 text-[11px] ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p> : null}
    </div>
  )
}
