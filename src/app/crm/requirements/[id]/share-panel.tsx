'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { shareRequirementWithClient } from '../actions'

/** Sends a staff-created requirement to the company's portal users for confirmation. */
export function ShareWithClientPanel({ requirementId }: { requirementId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await shareRequirementWithClient(requirementId, note)
        if ('error' in result) setError(result.error)
        else router.refresh()
      } catch {
        setError('Something went wrong. Please check your connection and try again.')
      }
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-xs">
      <h3 className="text-sm font-bold text-gray-900">Share with the client</h3>
      <p className="text-gray-600">
        This requirement is internal. Send it to the company&apos;s portal users so they can confirm it (and then choose products) or ask for changes. Nothing is quoted or ordered until the normal quotation steps.
      </p>
      <textarea
        aria-label="Message to the client"
        className="w-full rounded-lg border px-2 py-2"
        rows={2}
        maxLength={1000}
        placeholder="Message to the client (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      <button type="button" disabled={pending} onClick={submit} className="min-h-10 rounded-lg bg-[#9C7A33] px-4 font-semibold text-white disabled:opacity-60">
        {pending ? 'Sending…' : 'Send to client'}
      </button>
    </div>
  )
}
