'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, X } from 'lucide-react'
import { ProductImage } from '@/components/ui/product-image'

const EVENT = 'robust-cart-added'

type AddedDetail = { name: string; quantity: number; image_url?: string | null; colour?: string | null }

/** Fire after a successful addToCart() so the shared toast confirms it. */
export function notifyCartAdded(detail: AddedDetail) {
  window.dispatchEvent(new CustomEvent<AddedDetail>(EVENT, { detail }))
}

/**
 * Fixed-position confirmation for Add to Cart. Being fixed (not inserted into
 * the page flow) is what stops the page content from jumping when it appears.
 */
export function CartToast() {
  const [item, setItem] = useState<AddedDetail | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const onAdded = (event: Event) => {
      const detail = (event as CustomEvent<AddedDetail>).detail
      if (!detail) return
      setItem(detail)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setItem(null), 5000)
    }
    window.addEventListener(EVENT, onAdded)
    return () => {
      window.removeEventListener(EVENT, onAdded)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-28"
    >
      {item ? (
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_32px_rgba(27,36,48,0.18)]">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md catalogue-studio-field">
            <ProductImage src={item.image_url} alt={item.name} size="sm" fit="contain" className="absolute inset-0 h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
              <CheckCircle2 size={14} /> Added to cart
            </p>
            <p className="mt-0.5 truncate text-sm text-[#1B2430]">
              {item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.name}
              {item.colour ? ` · ${item.colour}` : ''}
            </p>
            <Link
              href="/cart"
              onClick={() => setItem(null)}
              className="mt-1.5 inline-flex min-h-8 items-center bg-[#9C7A33] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-[#7C6224]"
            >
              View cart
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setItem(null)}
            aria-label="Dismiss"
            className="self-start rounded p-1 text-[#94A3B8] hover:text-[#1B2430]"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
