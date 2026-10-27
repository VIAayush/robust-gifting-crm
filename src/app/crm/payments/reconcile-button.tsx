'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reconcileOnlinePayments } from './actions'

export function ReconcileButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function run() {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await reconcileOnlinePayments()
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({
            kind: 'ok',
            text: `Checked ${res.checked}: ${res.markedPaid} confirmed paid, ${res.markedFailed} marked failed, ${res.ordersCreated} order${res.ordersCreated === 1 ? '' : 's'} created, ${res.stillPending} still waiting on PayU${res.errors ? `, ${res.errors} need attention` : ''}.`,
          })
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }

  return (
    <div className="text-xs">
      <button type="button" onClick={run} disabled={pending} className="rounded-lg border border-[#9C7A33] px-4 py-2 font-semibold text-[#9C7A33] hover:bg-[#9C7A33]/5 disabled:opacity-60">
        {pending ? 'Checking with PayU…' : 'Reconcile online payments'}
      </button>
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 max-w-md ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p> : null}
    </div>
  )
}
