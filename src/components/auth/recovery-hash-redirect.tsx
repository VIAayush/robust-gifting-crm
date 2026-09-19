'use client'

import { useEffect } from 'react'

/**
 * Redirects Supabase auth hash links (implicit flow: #access_token=...&type=...)
 * to the right destination. This project issues hash-fragment tokens, which
 * only client JS can ever see, so /auth/confirm's server-side route can't
 * branch on `type` itself — this is where that branching actually happens.
 */
export function RecoveryHashRedirect() {
  useEffect(() => {
    try {
      const hash = window.location.hash
      if (!hash || hash.length < 2) return
      const params = new URLSearchParams(hash.slice(1))
      const type = params.get('type')

      if (type === 'signup') {
        // The email was already confirmed server-side when Supabase's own
        // /verify endpoint validated the token, before this hash ever arrived
        // here — no session needs to be established. Show a confirmation
        // page first instead of bouncing straight to sign-in.
        window.location.replace('/auth/confirmed?flow=signup')
        return
      }

      const isRecovery =
        type === 'recovery' ||
        (params.get('access_token') && params.get('refresh_token'))
      if (!isRecovery) return
      if (window.location.pathname.indexOf('/reset-password') === 0) return
      window.location.replace(`/reset-password${window.location.search}${window.location.hash}`)
    } catch {
      // ignore
    }
  }, [])

  return null
}
