'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteBanner, setBannerActive } from './actions'

export function BannerRowActions({ id, active, canEdit }: { id: string; active: boolean; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!canEdit) return null

  function run(task: () => Promise<{ success: true } | { error: string }>) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await task()
        if ('error' in res) setError(res.error)
        else router.refresh()
      } catch {
        setError('Something went wrong.')
      } finally {
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Link href={`/crm/banners?edit=${id}`} className="rounded-lg border px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">Edit</Link>
      <button type="button" disabled={pending} onClick={() => run(() => setBannerActive(id, !active))} className="rounded-lg border px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
        {active ? 'Hide' : 'Show'}
      </button>
      {confirming ? (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => deleteBanner(id))} className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white disabled:opacity-60">Confirm delete</button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-1.5 font-semibold text-gray-700">Cancel</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50">Delete</button>
      )}
      {error ? <span role="alert" className="text-red-700">{error}</span> : null}
    </div>
  )
}
