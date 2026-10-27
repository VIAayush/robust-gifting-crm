'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rollbackPriceBatch } from '@/app/crm/products/pricing/actions'

export type PriceBatchSummary = {
  id: string
  when: string
  source: string
  products: number
  rolledBack: boolean
}

export function PriceBatches({ batches, canManage }: { batches: PriceBatchSummary[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function rollback(id: string) {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await rollbackPriceBatch(id)
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({
            kind: 'ok',
            text: `Restored ${res.restored} product${res.restored === 1 ? '' : 's'}.${res.conflicts ? ` ${res.conflicts} left unchanged because they were edited after this batch.` : ''}`,
          })
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      } finally {
        setConfirming(null)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-gray-900">Bulk price batches</h2>
      <p className="mb-3 text-xs text-gray-500">
        Each bulk CSV update is one batch. Rolling back restores the previous price and MRP, but only for products not edited since.
      </p>
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mb-3 text-xs ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>
          {message.text}
        </p>
      ) : null}
      {batches.length === 0 ? (
        <p className="text-xs text-gray-400">No bulk batches recorded yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-xs">
          {batches.map((batch) => (
            <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold text-gray-900">{batch.source === 'rollback' ? 'Rollback' : 'Bulk CSV update'}</span>
                <span className="ml-2 text-gray-500">
                  {batch.when} · {batch.products} product{batch.products === 1 ? '' : 's'}
                </span>
                {batch.rolledBack ? <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">Rolled back</span> : null}
              </span>
              {canManage && batch.source !== 'rollback' && !batch.rolledBack ? (
                confirming === batch.id ? (
                  <span className="flex gap-2">
                    <button type="button" disabled={pending} onClick={() => rollback(batch.id)} className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white disabled:opacity-60">
                      {pending ? 'Rolling back…' : 'Confirm roll back'}
                    </button>
                    <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="rounded-lg border px-3 py-1.5 font-semibold text-gray-700">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(batch.id)} className="rounded-lg border px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">
                    Roll back
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
