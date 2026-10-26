import { createClient } from '@/lib/supabase/server'

/** True when the signed-in user is an active corporate client (portal) user. Anonymous visitors and staff are false. */
export async function isClientPortalUser(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle()
    return Boolean(profile?.is_active && (profile.role === 'client_admin' || profile.role === 'client_user'))
  } catch {
    // If the check itself fails (e.g. database unavailable) fall back to the guest experience.
    return false
  }
}
