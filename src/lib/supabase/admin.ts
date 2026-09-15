import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only service-role client. Never import this from a Client Component.
 * Returns null when the key is not configured so callers can show a clear error.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
