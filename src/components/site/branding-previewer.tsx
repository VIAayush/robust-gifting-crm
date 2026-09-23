'use client'

import { useState } from 'react'
import { ProductImage } from '@/components/ui/product-image'

const FINISHES = {
  gold: {
    label: 'Gold Foil',
    text: 'bg-gradient-to-r from-[#D9BC7A] via-[#9C7A33] to-[#7C6224] bg-clip-text text-transparent',
  },
  silver: {
    label: 'Silver Screen',
    text: 'bg-gradient-to-r from-[#E2E8F0] via-[#CBD5E1] to-[#94A3B8] bg-clip-text text-transparent',
  },
  laser: {
    label: 'Laser Engrave',
    text: 'text-[#1B2430] opacity-85',
  },
} as const

type Finish = keyof typeof FINISHES

/**
 * Simulates a logo/name placement on the actual product photo being viewed
 * (not a stock image) — a styled text overlay, clearly framed as indicative
 * so it's never mistaken for a real production proof.
 */
export function BrandingPreviewer({ imageUrl, productName }: { imageUrl: string | null; productName: string }) {
  const [brandText, setBrandText] = useState('YOUR LOGO')
  const [finish, setFinish] = useState<Finish>('gold')

  if (!imageUrl) return null

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1B2430]">Preview your branding</p>

      <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-lg catalogue-studio-field">
        <ProductImage
          src={imageUrl}
          alt={productName}
          size="lg"
          fit="contain"
          className="absolute inset-0 h-full w-full bg-transparent"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <span className={`rounded bg-black/5 px-3 py-1.5 text-center text-sm font-extrabold uppercase tracking-[0.18em] backdrop-blur-[1px] ${FINISHES[finish].text}`}>
            {brandText || 'YOUR LOGO'}
          </span>
        </div>
        <span className="absolute bottom-2 left-2 rounded-full bg-[#1B2430]/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
          Preview only
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5C6570]">Your company or brand name</label>
          <input
            type="text"
            value={brandText}
            onChange={(event) => setBrandText(event.target.value.slice(0, 24))}
            placeholder="e.g. ACME CORP"
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs outline-none focus:border-[#9C7A33]"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5C6570]">Finish</label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(Object.keys(FINISHES) as Finish[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFinish(key)}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  finish === key ? 'border-[#9C7A33] bg-[#9C7A33]/10 text-[#9C7A33]' : 'border-[#E2E8F0] text-[#5C6570] hover:border-[#9C7A33]'
                }`}
              >
                {FINISHES[key].label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-[#5C6570]">
          Indicative preview only — actual placement, size and finish are confirmed with your quote.
        </p>
      </div>
    </div>
  )
}
