import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { RECOVERY_COOKIE_NAME } from '@/lib/auth/tab'

export async function createRecoveryServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: RECOVERY_COOKIE_NAME,
        path: '/',
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Component
          }
        },
      },
    }
  )
}
