'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { GIFT_MODE_COOKIE, type GiftMode } from '@/lib/site/gift-mode'

function readCookie(): GiftMode {
  if (typeof document === 'undefined') return 'corporate'
  const match = document.cookie.match(new RegExp(`(?:^|; )${GIFT_MODE_COOKIE}=([^;]+)`))
  return match?.[1] === 'personalized' ? 'personalized' : 'corporate'
}

function writeCookie(mode: GiftMode) {
  document.cookie = `${GIFT_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`
}

/**
 * The site's two anchor pages (/ and /personalized) unambiguously set the
 * mode. Everywhere else (catalogue, categories, collections, product pages)
 * is shared between both, so it remembers whichever mode you last chose via
 * a cookie, so a product click from the catalogue grid doesn't drop you back
 * into the other mode.
 */
export function useGiftMode(): GiftMode {
  const pathname = usePathname()
  const [mode, setMode] = useState<GiftMode>(() => {
    if (pathname?.startsWith('/personalized')) return 'personalized'
    if (pathname === '/' || pathname?.startsWith('/home')) return 'corporate'
    return readCookie()
  })

  useEffect(() => {
    if (pathname?.startsWith('/personalized')) {
      writeCookie('personalized')
      setMode('personalized')
    } else if (pathname === '/' || pathname?.startsWith('/home')) {
      writeCookie('corporate')
      setMode('corporate')
    } else {
      setMode(readCookie())
    }
  }, [pathname])

  return mode
}
