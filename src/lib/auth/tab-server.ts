import { headers } from 'next/headers'
import { TAB_HEADER, TAB_QUERY, isTabId } from '@/lib/auth/tab'

export async function getRequestTabId() {
  const h = await headers()
  const headerTab = h.get(TAB_HEADER)
  if (isTabId(headerTab)) return headerTab

  for (const raw of [h.get('next-url'), h.get('x-url'), h.get('referer')]) {
    if (!raw) continue
    try {
      const url = new URL(raw, 'http://localhost')
      const queryTab = url.searchParams.get(TAB_QUERY)
      if (isTabId(queryTab)) return queryTab
    } catch {
      // ignore
    }
  }

  return null
}
