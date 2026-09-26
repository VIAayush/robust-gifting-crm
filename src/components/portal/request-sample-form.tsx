'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitSampleRequest } from '@/app/portal/interest/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#9C7A33] px-3 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Request Sample'}
    </button>
  )
}

export function RequestSampleForm({
  productId,
  variantId,
  customizationEnabled = false,
}: {
  productId: string
  variantId?: string | null
  customizationEnabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return <p className="text-xs font-medium text-green-700">Sample requested — we&apos;ll follow up shortly.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#9C7A33] hover:bg-[#F5F7FA]"
      >
        Request Sample
      </button>
    )
  }

  return (
    <form
      action={async (formData) => {
        setError(null)
        const result = await submitSampleRequest(formData)
        if (result?.error) setError('We could not send your sample request. Please try again.')
        else setDone(true)
      }}
      className="space-y-2 rounded-lg border border-[#E2E8F0] bg-[#F5F7FA] p-2.5"
    >
      <input type="hidden" name="product_id" value={productId} />
      {variantId ? <input type="hidden" name="variant_id" value={variantId} /> : null}
      {error ? <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</p> : null}
      <div className="flex items-center gap-2">
        <label htmlFor={`sample-qty-${productId}`} className="text-[11px] font-medium text-gray-600">Qty</label>
        <input
          id={`sample-qty-${productId}`}
          type="number"
          name="quantity"
          min={1}
          max={999}
          defaultValue={1}
          className="min-h-8 w-16 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs outline-none focus:border-[#9C7A33]"
        />
      </div>
      <textarea
        name="notes"
        rows={2}
        aria-label="Delivery contact or notes"
        placeholder="Delivery contact / notes (optional)"
        className="w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs outline-none focus:border-[#9C7A33]"
      />
      {customizationEnabled ? (
        <textarea
          name="customization_notes"
          rows={2}
          maxLength={1000}
          aria-label="Customization requirements"
          placeholder="Customization: logo, name, message, colours (optional)"
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs outline-none focus:border-[#9C7A33]"
        />
      ) : null}
      <div className="flex gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
