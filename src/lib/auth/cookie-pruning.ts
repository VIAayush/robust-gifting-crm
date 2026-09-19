import { AUTH_COOKIE_PREFIX, isTabId } from '@/lib/auth/tab'

const TRACKER_COOKIE = 'gf-auth-tabs'
/**
 * Every browser tab gets its own gf-auth-<tabId> cookie (see tab.ts) so
 * different tabs can hold different logged-in accounts at once. Nothing ever
 * removes one of these when its tab is just closed rather than explicitly
 * signed out of, so left unchecked they accumulate forever — one per tab a
 * person has ever opened this app in — until the browser's Cookie header for
 * this site gets too large for the server to accept (HTTP 431, "Request
 * Header Fields Too Large"). Capping how many can exist at once, and
 * clearing the least-recently-active ones, keeps that header bounded no
 * matter how long the app has been in use, without touching genuinely
 * concurrent tabs (their cookie gets refreshed by normal use, which is what
 * keeps them off the eviction list).
 */
const MAX_TRACKED_TABS = 8
/** Chunk suffixes (gf-auth-<tabId>.0, .1, …) Supabase may split a large session cookie into. */
const MAX_COOKIE_CHUNKS = 4

type MinimalCookieJar = {
  get(name: string): { value: string } | undefined
  set(name: string, value: string, options?: Record<string, unknown>): void
}

/**
 * Call whenever a gf-auth-<tabId> cookie is written. Records that tab as the
 * most recently active, and if that pushes the tracked count over the cap,
 * clears the auth cookie(s) for whichever tab(s) fell off the end.
 */
export function trackAuthCookieAndPruneOld(jar: MinimalCookieJar, cookieName: string) {
  if (!cookieName.startsWith(AUTH_COOKIE_PREFIX)) return
  const tabId = cookieName.slice(AUTH_COOKIE_PREFIX.length).replace(/\.\d+$/, '')
  if (!isTabId(tabId)) return

  let tracked: string[]
  try {
    tracked = (jar.get(TRACKER_COOKIE)?.value || '').split(',').filter(isTabId)
  } catch {
    tracked = []
  }

  tracked = tracked.filter((id) => id !== tabId)
  tracked.push(tabId)

  const evicted: string[] = []
  while (tracked.length > MAX_TRACKED_TABS) {
    const oldest = tracked.shift()
    if (oldest) evicted.push(oldest)
  }

  try {
    for (const oldTabId of evicted) {
      jar.set(`${AUTH_COOKIE_PREFIX}${oldTabId}`, '', { path: '/', maxAge: 0 })
      for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
        jar.set(`${AUTH_COOKIE_PREFIX}${oldTabId}.${i}`, '', { path: '/', maxAge: 0 })
      }
    }
    jar.set(TRACKER_COOKIE, tracked.join(','), {
      path: '/',
      maxAge: 400 * 24 * 60 * 60,
      sameSite: 'lax',
    })
  } catch {
    // Cookie mutation isn't allowed in every context (e.g. a plain Server
    // Component render) — safe to skip; the next action or middleware pass
    // that touches this tab's cookie will retry.
  }
}
