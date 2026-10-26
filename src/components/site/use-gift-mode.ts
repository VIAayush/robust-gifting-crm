'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { GIFT_MODE_COOKIE, modeForPath, type GiftMode } from '@/lib/site/gift-mode'

function readCookie(): GiftMode {
  if (typeof document === 'undefined') return 'corporate'
  const match = document.cookie.match(new RegExp(`(?:^|; )${GIFT_MODE_COOKIE}=([^;]+)`))
  return match?.[1] === 'personalized' ? 'personalized' : 'corporate'
}

export function writeGiftModeCookie(mode: GiftMode) {
  document.cookie = `${GIFT_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Mode-specific pages (see modeForPath: /personalized/*, /cart, /checkout vs
 * /, /home, /catalogue) set the mode. Shared pages (about,
 * categories, collections, wishlist) keep whichever mode you last chose, via
 * a cookie, so moving around the site never flips you into the other mode.
 *
 * `initialMode` is the value the server already resolved for this request, so
 * the first client render matches the server-rendered markup.
 */
export function useGiftMode(initialMode?: GiftMode): GiftMode {
  const pathname = usePathname()
  const [mode, setMode] = useState<GiftMode>(() => modeForPath(pathname) ?? initialMode ?? readCookie())

  useEffect(() => {
    const forced = modeForPath(pathname)
    if (forced) {
      writeGiftModeCookie(forced)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the route after client navigation
      setMode(forced)
    } else {
      setMode(readCookie())
    }
    // initialMode changes when a mode switch refreshes a shared page in place.
  }, [pathname, initialMode])

  return mode
}
