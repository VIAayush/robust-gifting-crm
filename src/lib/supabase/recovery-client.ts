import { createBrowserClient } from '@supabase/ssr'
import { RECOVERY_COOKIE_NAME } from '@/lib/auth/tab'

export function createRecoveryBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      auth: {
        detectSessionInUrl: false,
      },
      cookieOptions: {
        name: RECOVERY_COOKIE_NAME,
        path: '/',
        sameSite: 'lax',
      },
    }
  )
}
