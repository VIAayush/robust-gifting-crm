import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { authCookieName } from '@/lib/auth/tab'
import { getRequestTabId } from '@/lib/auth/tab-server'
import { trackAuthCookieAndPruneOld } from '@/lib/auth/cookie-pruning'

export async function createClient() {
  const cookieStore = await cookies()
  const tabId = await getRequestTabId()
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
