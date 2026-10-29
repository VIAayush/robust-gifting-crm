'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProductImage } from '@/components/ui/product-image'
import { formatCurrency, formatUnits } from '@/lib/utils'
import { submitCatalogueResponse } from '../actions'
import { RequestQuotationButton } from './request-quotation-button'

export type OfferingCard = {
  id: string
  product_id: string
  name: string
  description: string | null
  image_url: string | null
  price: number
  moq: number
}

export type ExistingResponse = {
  status: 'submitted' | 'processed'
  comment: string
  submittedAt: string
  processedAt: string | null
  requirementId: string | null
  revision: number
  items: { campaign_product_id: string; quantity: number; notes: string | null }[]
} | null

type Line = { quantity: string; notes: string }

const inputClass = 'w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm focus:border-[#9C7A33] focus:outline-none'

export function CatalogueSelection({
  campaignId,
  catalogueName,
  offerings,
  existing,
  responsesAvailable,
}: {
  campaignId: string
  catalogueName: string
  offerings: OfferingCard[]
  existing: ExistingResponse
  responsesAvailable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [lines, setLines] = useState<Record<string, Line>>(() => {
    const initial: Record<string, Line> = {}
    for (const item of existing?.items || []) {
      if (offerings.some((o) => o.id === item.campaign_product_id)) {
        initial[item.campaign_product_id] = { quantity: String(item.quantity), notes: item.notes || '' }
      }
    }
    return initial
  })
  const [comment, setComment] = useState(existing?.comment || '')
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const selectedIds = useMemo(() => offerings.filter((o) => lines[o.id]).map((o) => o.id), [offerings, lines])
  const processed = existing?.status === 'processed'

  function toggle(offering: OfferingCard) {
    setFeedback(null)
    setLines((prev) => {
      const next = { ...prev }
      if (next[offering.id]) delete next[offering.id]
      else next[offering.id] = { quantity: String(Math.max(1, offering.moq || 1)), notes: '' }
      return next
    })
  }
  function selectAll() {
    setFeedback(null)
    setLines((prev) => {
      const next = { ...prev }
      for (const o of offerings) if (!next[o.id]) next[o.id] = { quantity: String(Math.max(1, o.moq || 1)), notes: '' }
      return next
    })
  }
  function clearAll() {
    setFeedback(null)
    setLines({})
  }
  function update(id: string, patch: Partial<Line>) {
    setFeedback(null)
    setLines((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
  }

  function send() {
    if (pending) return
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await submitCatalogueResponse(
          campaignId,
          selectedIds.map((id) => ({ campaign_product_id: id, quantity: lines[id].quantity, notes: lines[id].notes })),
          comment,
        )
        if ('error' in result) setFeedback({ ok: false, text: result.error })
        else {
          setFeedback({ ok: true, text: result.message })
          router.refresh()
        }
      } catch {
        setFeedback({ ok: false, text: 'Something went wrong. Please check your connection and try again.' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {existing ? (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${processed ? 'border-green-200 bg-green-50 text-green-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
        >
          {processed ? (
            <>
              <p className="font-semibold">Your account manager has picked up your response.</p>
              <p className="mt-1">
                {existing.requirementId ? (
                  <>
                    A requirement was prepared for you.{' '}
                    <Link className="font-semibold underline" href={`/portal/requirements/${existing.requirementId}`}>
                      Open it
                    </Link>
                  </>
                ) : (
                  'They will be in touch about the next steps.'
                )}
              </p>
              <p className="mt-1 text-xs">You can send a new response below if you want to change anything.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Response sent – awaiting your account manager</p>
              <p className="mt-1">
                Sent {new Date(existing.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {existing.revision > 1 ? ` (updated ${existing.revision - 1} time${existing.revision === 2 ? '' : 's'})` : ''}. You can still change your selection and send it again.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
        <p aria-live="polite" className="font-medium text-gray-800">
          {selectedIds.length} of {offerings.length} gift{offerings.length === 1 ? '' : 's'} selected
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={selectedIds.length === offerings.length}
            className="min-h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selectedIds.length === 0}
            className="min-h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {offerings.map((item) => {
          const line = lines[item.id]
          return (
            <article
              key={item.id}
              className={`flex flex-col overflow-hidden rounded-lg border bg-white ${line ? 'border-[#9C7A33] ring-1 ring-[#9C7A33]/40' : 'border-gray-200'}`}
            >
              <Link href={`/portal/catalogue/product/${item.product_id}`} className="block">
                <div className="relative aspect-square border-b border-gray-100 bg-[#F5F7FA]">
                  <ProductImage src={item.image_url} alt={item.name || 'Gift'} size="md" className="absolute inset-0 h-full w-full" />
                </div>
              </Link>
              <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                <div>
                  <Link href={`/portal/catalogue/product/${item.product_id}`}>
                    <h2 className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-[#9C7A33]">{item.name}</h2>
                  </Link>
                  {item.description ? <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.description}</p> : null}
                </div>
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{formatCurrency(item.price)}</p>
                    <p className="text-[10px] text-gray-400">MOQ: {formatUnits(item.moq ?? 1)}</p>
                  </div>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={Boolean(line)}
                      onChange={() => toggle(item)}
                      aria-label={`Select ${item.name}`}
                      className="h-5 w-5 accent-[#9C7A33]"
                    />
                    I&apos;m interested
                  </label>
                  {line ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-600">
                        Quantity
                        <input
                          className={`${inputClass} mt-1`}
                          inputMode="numeric"
                          min={Math.max(1, item.moq || 1)}
                          value={line.quantity}
                          onChange={(e) => update(item.id, { quantity: e.target.value.replace(/[^0-9]/g, '') })}
                        />
                      </label>
                      <label className="block text-xs font-medium text-gray-600">
                        Note (optional)
                        <input className={`${inputClass} mt-1`} maxLength={500} value={line.notes} onChange={(e) => update(item.id, { notes: e.target.value })} placeholder="Colour, branding, anything else" />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <section aria-labelledby="respond-heading" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 id="respond-heading" className="font-serif text-lg">Respond to {catalogueName}</h2>
          <p className="mt-1 text-sm text-gray-600">Choose what you would like to do with your selection.</p>
        </div>

        {responsesAvailable ? (
          <div className="space-y-2 rounded-lg bg-[#F5F7FA] p-4">
            <h3 className="text-sm font-semibold text-gray-900">1. Send your selection to your account manager</h3>
            <p className="text-xs text-gray-600">
              Tells us which gifts you want and any changes you would like. Nothing is ordered or quoted yet; your account manager will follow up with you.
            </p>
            <label className="block text-sm font-medium text-gray-700">
              Comments or requested changes (optional)
              <textarea className={`${inputClass} mt-1`} rows={3} maxLength={2000} value={comment} onChange={(e) => { setFeedback(null); setComment(e.target.value) }} />
            </label>
            <button
              type="button"
              onClick={send}
              disabled={pending || (selectedIds.length === 0 && !comment.trim())}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-5 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60 sm:w-auto"
            >
              {pending ? 'Sending…' : existing && !processed ? 'Send updated response' : 'Send my response'}
            </button>
            {feedback ? (
              <p role={feedback.ok ? 'status' : 'alert'} className={`text-sm ${feedback.ok ? 'text-green-700' : 'text-red-700'}`}>
                {feedback.text}
              </p>
            ) : null}
          </div>
        ) : (
          <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Sending a response is not available yet. You can still request a quotation below.
          </p>
        )}

        <div className="space-y-2 rounded-lg border border-[#E2E8F0] p-4">
          <h3 className="text-sm font-semibold text-gray-900">{responsesAvailable ? '2. ' : ''}Start a requirement for a quotation</h3>
          <p className="text-xs text-gray-600">
            Adds {selectedIds.length > 0 ? 'the selected gifts' : 'all gifts in this catalogue'} to your shortlist and opens the requirement form. This is a formal request for a quotation.
          </p>
          <RequestQuotationButton campaignId={campaignId} offeringIds={selectedIds} />
        </div>
      </section>
    </div>
  )
}
