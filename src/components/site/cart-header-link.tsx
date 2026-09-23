'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { cartCount, CART_EVENT } from '@/lib/site/cart'
import { cn } from '@/lib/utils'

export function CartHeaderLink({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const sync = () => setCount(cartCount())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener(CART_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CART_EVENT, sync)
    }
  }, [])

  return (
    <Link
      href="/cart"
      className={cn(
        'relative inline-flex items-center gap-1.5 text-xs',
        variant === 'dark' ? 'text-white/90' : 'text-[#9C7A33]',
      )}
      aria-label={`Cart (${count} item${count === 1 ? '' : 's'})`}
    >
      <ShoppingBag size={14} />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 ? (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9C7A33] px-1 text-[9px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  )
}
