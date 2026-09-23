'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { readWishlist, WISHLIST_EVENT } from '@/lib/site/wishlist'
import { cn } from '@/lib/utils'

export function WishlistHeaderLink({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const sync = () => setCount(readWishlist().length)
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(WISHLIST_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(WISHLIST_EVENT, sync)
    }
  }, [])

  return (
    <Link
      href="/wishlist"
      className={cn(
        'relative inline-flex items-center gap-1.5 text-xs',
        variant === 'dark' ? 'text-white/90' : 'text-[#9C7A33]',
      )}
      aria-label={`Wishlist (${count} item${count === 1 ? '' : 's'})`}
    >
      <Heart size={14} className={count > 0 ? 'fill-current' : ''} />
      <span className="hidden sm:inline">Wishlist</span>
      {count > 0 ? (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9C7A33] px-1 text-[9px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  )
}
