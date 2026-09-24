'use client'

import { useEffect } from 'react'
import { clearCart } from '@/lib/site/cart'

/** Rendered only on a confirmed-paid order — empties the cart once, client-side (server actions can't touch localStorage). */
export function ClearCartOnMount() {
  useEffect(() => {
    clearCart()
  }, [])
  return null
}
