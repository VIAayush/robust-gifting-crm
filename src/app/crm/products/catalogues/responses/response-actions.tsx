'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createRequirementFromCatalogueResponse, markCatalogueResponseProcessed } from './actions'

export function ResponseActions({
  responseId,
  hasProducts,
  requirementId,
  processed,
  canAct,
}: {
  responseId: string
  hasProducts: boolean
  requirementId: string | null
  processed: boolean
  canAct: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [share, setShare] = useState(true)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  function run(task: () => Promise<{ success: true; message: string } | { error: string }>) {
    if (pending) return
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await task()
        if ('error' in result) setFeedback({ ok: false, text: result.error })
        else {
          setFeedback({ ok: true, text: result.message })
          router.refresh()
        }
      } catch {
        setFeedback({ ok: false, text: 'Something went wrong. Please try again.' })
      }
    })
  }

  return (
    <div className="space-y-2 text-xs">
      {requirementId ? (
        <Link href={`/crm/requirements/${requirementId}`} className="inline-flex min-h-9 items-center rounded-lg border border-[#E2E8F0] px-3 font-semibold text-[#9C7A33] hover:bg-gray-50">
          Open requirement
        </Link>
      ) : null}
      {canAct && !processed ? (
        <div className="space-y-2">
          {hasProducts ? (
            <>
              <label className="flex items-center gap-2 text-gray-700">
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 accent-[#9C7A33]" />
                Send the requirement to the client for confirmation
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => createRequirementFromCatalogueResponse(responseId, share))}
                className="min-h-9 rounded-lg bg-[#9C7A33] px-3 font-semibold text-white disabled:opacity-60"
              >
                {pending ? 'Working…' : 'Create requirement'}
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markCatalogueResponseProcessed(responseId))}
            className="ml-0 min-h-9 rounded-lg border border-[#E2E8F0] px-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:ml-2"
          >
            Mark as processed
          </button>
        </div>
      ) : null}
      {feedback ? (
        <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-green-700' : 'text-red-700'}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
