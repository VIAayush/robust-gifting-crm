import { createBrowserClient } from '@supabase/ssr'
import { TAB_STORAGE_KEY, authCookieName, createTabId } from '@/lib/auth/tab'

export function getTabId() {
  if (typeof window === 'undefined') return 'none'
  const existing = window.sessionStorage.getItem(TAB_STORAGE_KEY)
  if (existing) return existing
  const tabId = createTabId()
  window.sessionStorage.setItem(TAB_STORAGE_KEY, tabId)
  return tabId
}

export function createClient() {
  const tabId = getTabId()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      auth: {
        detectSessionInUrl: false,
      },
      cookieOptions: {
        name: authCookieName(tabId),
        path: '/',
        sameSite: 'lax',
      },
    }
  )
}
