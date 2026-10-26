'use client'

import { useState, useTransition } from 'react'
import { requestCatalogueQuotation } from '../actions'

export function RequestQuotationButton({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          const formData = new FormData()
          formData.set('campaign_id', campaignId)
          startTransition(async () => {
            try {
              const res = await requestCatalogueQuotation(formData)
              if (res?.error) setError(res.error)
            } catch (err) {
              if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw err
              setError('Something went wrong. Please try again.')
            }
          })
        }}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9C7A33] px-5 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
      >
        {pending ? 'Preparing…' : 'Request quotation'}
      </button>
      <p className="text-[11px] text-gray-500 sm:text-right">Adds these gifts to your shortlist and opens a requirement.</p>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
