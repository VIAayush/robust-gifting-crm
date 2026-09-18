import { TAB_REMEMBER_KEY } from '@/lib/auth/tab'
import { getTabId } from '@/lib/supabase/client'

/** Called after a successful sign-in when "Keep me signed in" is checked, so a new tab opened later on this browser reuses this tab's session instead of starting logged out. */
export function rememberThisTab() {
  try {
    window.localStorage.setItem(TAB_REMEMBER_KEY, getTabId())
  } catch {
    // Storage can be unavailable (private browsing, blocked); staying signed in on new tabs is best-effort.
  }
}

/** Called when "Keep me signed in" is unchecked at login, and on explicit sign-out. */
export function forgetRememberedTab() {
  try {
    window.localStorage.removeItem(TAB_REMEMBER_KEY)
  } catch {
    // Ignore storage failures.
  }
}
