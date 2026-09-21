import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { authCookieName } from '@/lib/auth/tab'
import { getRequestTabId } from '@/lib/auth/tab-server'
import { trackAuthCookieAndPruneOld } from '@/lib/auth/cookie-pruning'

/**
 * `explicitTabId`, when given, wins over header/URL sniffing. Server Actions
 * invoked as a plain async call (not a <form action> binding) go through
 * Next's own internal action-dispatch transport, which does not reliably
 * carry a header set via a patched window.fetch or a query param set via a
 * patched history API — both were observed to go missing in production. A
 * value read straight from the action's own FormData has no such gap.
 */
export async function createClient(explicitTabId?: string) {
  const cookieStore = await cookies()
  const tabId = explicitTabId || (await getRequestTabId())
  const cookieName = authCookieName(tabId || 'none')

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              trackAuthCookieAndPruneOld(cookieStore, name)
            })
          } catch {
            // Ignored in Server Component
          }
        },
      },
    }
  )
}
