'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ProductImage } from '@/components/ui/product-image'
import { cn } from '@/lib/utils'

export type GalleryImage = { url: string; alt: string }

/**
 * Single hero image when there's only one photo — no arrows, no clutter.
 * With more than one, adds prev/next controls, an index counter, keyboard
 * left/right and touch swipe. Callers that swap the whole image set (e.g.
 * switching colour) should pass a matching `key` so it remounts at photo 1
 * instead of keeping the old index.
 */
export function ProductGallery({ images, className }: { images: GalleryImage[]; className?: string }) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const count = images.length
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1)
  const current = images[safeIndex]

  const go = (delta: number) => {
    if (count <= 1) return
    setIndex((i) => (i + delta + count) % count)
  }

  useEffect(() => {
    if (count <= 1) return
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement
      const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
      if (isTyping) return
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return (
    <div
      className={cn('relative', className)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return
        const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
        touchStartX.current = null
        if (Math.abs(delta) < 40) return
        go(delta > 0 ? -1 : 1)
      }}
    >
      <ProductImage
        src={current?.url}
        alt={current?.alt || 'Product'}
        size="hero"
        fit="contain"
        fadeEdges
        className="absolute inset-0 h-full w-full bg-transparent"
        imgClassName="catalogue-product-img"
      />

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-[#1B2430] shadow-sm transition-colors hover:bg-white"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-[#1B2430] shadow-sm transition-colors hover:bg-white"
          >
            <ChevronRight size={18} />
          </button>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white">
            {safeIndex + 1} / {count}
          </span>
        </>
      )}
    </div>
  )
}
