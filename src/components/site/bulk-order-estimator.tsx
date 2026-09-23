'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { QuoteForm } from '@/components/site/quote-form'

/**
 * Quantity → subtotal estimator at real list price. Deliberately does not
 * invent bulk-discount percentages — this business negotiates final bulk
 * pricing offline per client, so showing a made-up "X% off" here would be a
 * pricing claim nobody approved. "Get bulk pricing" opens the same quote
 * enquiry used elsewhere on the site, pre-filled with the chosen quantity.
 */
export function BulkOrderEstimator({
  productId,
  productName,
  price,
  moq,
}: {
  productId: string
  productName: string
  price: number | null
  moq: number
}) {
  const [quantity, setQuantity] = useState(Math.max(moq, 50))
  const [open, setOpen] = useState(false)

  if (!price) return null
  const subtotal = price * quantity

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F5F7FA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1B2430]">Estimate a bulk order</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-[#5C6570]">Quantity</span>
        <span className="text-sm font-bold text-[#9C7A33]">{quantity.toLocaleString('en-IN')} units</span>
      </div>
      <input
        type="range"
        min={moq}
        max={Math.max(moq * 20, 1000)}
        step={Math.max(5, Math.round(moq / 5))}
        value={quantity}
        onChange={(event) => setQuantity(Number(event.target.value))}
        className="mt-2 w-full accent-[#9C7A33]"
      />
      <div className="mt-3 flex items-end justify-between border-t border-[#E2E8F0] pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#5C6570]">List-price subtotal</p>
          <p className="text-lg font-bold text-[#1B2430]">{formatCurrency(subtotal)}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[#9C7A33] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9C7A33] hover:bg-white"
        >
          Get bulk pricing
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#5C6570]">
        Shown at list price. Bulk discounts, branding and delivery are confirmed with your account manager.
      </p>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Request bulk pricing for ${productName}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="my-8 w-full max-w-lg rounded-md bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]">Bulk pricing enquiry</p>
                <h2 className="mt-1 font-serif text-xl leading-snug text-[#1B2430]">{productName}</h2>
                <p className="mt-1 text-[11px] text-[#5C6570]">{quantity.toLocaleString('en-IN')} units</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-[#5C6570] transition-colors hover:bg-[#F1F4F9] hover:text-[#1B2430]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <QuoteForm productId={productId} productName={productName} showContext={false} defaultQuantity={quantity} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
