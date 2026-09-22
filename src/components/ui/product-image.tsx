'use client'

import React from 'react'
import Image from 'next/image'
import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'hero'
type Fit = 'contain' | 'cover'

/**
 * Roughly how wide this size ever renders on screen, used as the `sizes`
 * hint for next/image's responsive srcset. Product photos here were coming
 * straight from Supabase Storage as plain <img> tags - full multi-MB
 * originals downloaded for every card regardless of its actual display
 * size, on every page, which was the main cause of the site feeling slow
 * to load (especially on mobile). Rough per-size bounds are enough; being
 * exact isn't the point, avoiding "phone downloads a 2MB desktop hero for
 * an 80px thumbnail" is.
 */
const sizeHints: Record<Size, string> = {
  xs: '32px',
  sm: '56px',
  md: '(min-width: 1024px) 220px, (min-width: 640px) 33vw, 45vw',
  lg: '128px',
  hero: '(min-width: 1024px) 480px, 100vw',
}

/** Warm studio field — keep in sync with `.catalogue-studio-field` in globals.css */
export const STUDIO_FIELD = '#E7EDF4'

const sizeWrap: Record<Size, string> = {
  xs: 'w-8 h-8',
  sm: 'w-14 h-14',
  md: 'aspect-square w-full h-auto min-h-0',
  lg: 'w-32 h-32',
  hero: 'w-full aspect-square min-h-0',
}

function usableSrc(src?: string | null): string | null {
  if (!src) return null
  const trimmed = src.trim()
  if (!trimmed) return null
  if (trimmed === 'undefined' || trimmed === 'null') return null
  return trimmed
}

function Fallback({ alt, compact }: { alt: string; compact: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#9C7A33]"
      style={{ backgroundColor: STUDIO_FIELD }}
      role="img"
      aria-label={alt || 'Product'}
    >
      <span className={cn('font-serif tracking-tight', compact ? 'text-xs' : 'text-lg')}>R</span>
      {!compact && <Package className="h-5 w-5 text-[#C9D3E0]" aria-hidden="true" />}
    </div>
  )
}

/**
 * Safe product thumbnail. Broken, empty, null and failed URLs all resolve
 * to the same Robust Gifting placeholder — never a browser broken-image icon.
 */
export function ProductImage({
  src,
  alt,
  size = 'md',
  fit = 'contain',
  className = '',
  imgClassName = '',
  fadeEdges = false,
  priority = false,
  sizes,
}: {
  src?: string | null
  alt: string
  size?: Size
  fit?: Fit
  className?: string
  imgClassName?: string
  /** Feather photo edges into the studio field (public catalogue tiles). */
  fadeEdges?: boolean
  /** Skip lazy-loading for above-the-fold images (e.g. a hero slide). */
  priority?: boolean
  /** Override the default per-size responsive-width hint. */
  sizes?: string
}) {
  const resolved = usableSrc(src)
  const [failed, setFailed] = React.useState(false)
  const showImage = Boolean(resolved) && !failed
  const compact = size === 'xs' || size === 'sm'
  const fillParent =
    fit === 'cover' ||
    className.includes('h-full') ||
    className.includes('absolute') ||
    className.includes('inset-0')

  React.useEffect(() => {
    setFailed(false)
  }, [resolved])

  const wantsFade =
    fadeEdges ||
    imgClassName.includes('catalogue-product-img')

  return (
    <div
      className={cn(
        'relative overflow-hidden flex items-center justify-center catalogue-studio-field',
        fillParent ? 'h-full min-h-0 w-full' : sizeWrap[size],
        className,
      )}
    >
      {showImage ? (
        <Image
          src={resolved as string}
          alt={alt || 'Product'}
          fill
          sizes={sizes || sizeHints[size]}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className={cn(
            fit === 'cover' ? 'object-cover' : 'object-contain',
            fit === 'contain' && compact ? 'p-0.5' : fit === 'contain' ? 'p-0' : '',
            wantsFade && !imgClassName.includes('catalogue-product-img') ? 'catalogue-product-img' : '',
            imgClassName,
          )}
          onError={() => setFailed(true)}
        />
      ) : (
        <Fallback alt={alt} compact={compact} />
      )}
    </div>
  )
}
