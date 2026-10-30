import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False while the page is still server-rendered HTML, true once React has taken over in the browser.
 * Forms that hold passwords use it to keep their submit button off until then: before hydration the browser would
 * submit them natively as a GET and put the email and password in the address bar (and so in history and logs).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
