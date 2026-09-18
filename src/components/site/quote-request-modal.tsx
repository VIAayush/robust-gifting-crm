'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { QuoteForm } from '@/components/site/quote-form'

/**
 * "Request a Quote" on a product page: opens the enquiry form in place, already
 * carrying the product's SKU and the colour the shopper picked, instead of
 * sending them off to /request-quote and losing that selection.
 */
export function QuoteRequestModal({
  productId,
  productName,
  productSku,
  variantColour,
}: {
  productId: string
  productName: string
  productSku: string
  variantColour?: string | null
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex justify-center bg-[#9C7A33] px-7 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#7C6224] sm:py-3"
      >
        Request a Quote
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Request a quote for ${productName}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="my-8 w-full max-w-lg rounded-md bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]">Request a quote</p>
                <h2 className="mt-1 font-serif text-xl leading-snug text-[#1B2430]">{productName}</h2>
                <p className="mt-1 font-mono text-[11px] text-[#5C6570]">
                  {productSku}
                  {variantColour ? ` — ${variantColour}` : ''}
                </p>
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
              <QuoteForm
                productId={productId}
                productName={productName}
                variantColour={variantColour}
                showContext={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
