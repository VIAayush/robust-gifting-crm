'use client'

import { useLayoutEffect, useEffect, type ReactNode } from 'react'
import { recoveryClientDestination } from '@/lib/auth/recovery'
import { TAB_HEADER, TAB_QUERY, TAB_STORAGE_KEY, TAB_REMEMBER_KEY, createTabId, isAuthCallbackLocation, isLegacySupabaseAuthCookie, isPasswordRecoveryLocation } from '@/lib/auth/tab'
import { createClient, getTabId } from '@/lib/supabase/client'

function withTabQuery(url: string, tabId: string) {
  const next = new URL(url, window.location.href)
  if (next.origin !== window.location.origin) return url
  next.searchParams.set(TAB_QUERY, tabId)
  return `${next.pathname}${next.search}${next.hash}`
}

function ensureTabQuery() {
  const tabId = getTabId()
  const url = new URL(window.location.href)
  if (url.searchParams.get(TAB_QUERY) === tabId) return
  url.searchParams.set(TAB_QUERY, tabId)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function clearLegacyAuthCookies() {
  const cookies = document.cookie.split(';')
  for (const part of cookies) {
    const name = part.split('=')[0]?.trim()
    if (!name || !isLegacySupabaseAuthCookie(name)) continue
    document.cookie = `${name}=; path=/; max-age=0`
  }
}

function installTabFetch(tabId: string) {
  const w = window as Window & { __giffterTabFetchInstalled?: boolean }
  if (w.__giffterTabFetchInstalled) return
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const currentTab = sessionStorage.getItem(TAB_STORAGE_KEY) || tabId
    const headers = new Headers(init?.headers)
    if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        if (!headers.has(key)) headers.set(key, value)
      })
    }
    headers.set(TAB_HEADER, currentTab)
    return original(input, { ...init, headers })
  }
  w.__giffterTabFetchInstalled = true
}

function installHistoryPatch() {
  const w = window as Window & { __giffterHistoryPatched?: boolean }
  if (w.__giffterHistoryPatched) return
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  history.pushState = (data, unused, url) => {
    if (url != null && String(url).length > 0) {
      return push(data, unused, withTabQuery(String(url), getTabId()))
    }
    return push(data, unused, url)
  }
  history.replaceState = (data, unused, url) => {
    if (url != null && String(url).length > 0) {
      return replace(data, unused, withTabQuery(String(url), getTabId()))
    }
    return replace(data, unused, url)
  }
  w.__giffterHistoryPatched = true
}

export function TabSessionProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const href = window.location.href
    if (isPasswordRecoveryLocation(href)) {
      const dest = recoveryClientDestination(href)
      if (dest) {
        window.location.replace(dest)
        return
      }
    }
    const path = window.location.pathname
    if (path.startsWith('/reset-password') || path.startsWith('/auth/confirm')) {
      return
    }
    if (!sessionStorage.getItem(TAB_STORAGE_KEY)) {
      // "Keep me signed in" at login stores the tab id here too. A brand-new
      // tab reuses it instead of a fresh random id, so it maps to the same
      // gf-auth-<tabId> cookie and doesn't come up logged out. If another
      // tab is concurrently using that id, the BroadcastChannel claim below
      // still kicks this tab to a fresh one, so multi-account tabs stay safe.
      let remembered: string | null = null
      try {
        remembered = localStorage.getItem(TAB_REMEMBER_KEY)
      } catch {
        // Storage can be unavailable (private browsing, blocked).
      }
      sessionStorage.setItem(TAB_STORAGE_KEY, remembered || createTabId())
    }
    const tabId = getTabId()
    const nonce = `${tabId}:${Math.random().toString(36).slice(2)}`
    const channel = new BroadcastChannel('giffter-tab')
    channel.onmessage = (event) => {
      const data = event.data as { type?: string; tabId?: string; nonce?: string }
      if (data?.type === 'claim' && data.tabId === getTabId() && data.nonce !== nonce) {
        sessionStorage.setItem(TAB_STORAGE_KEY, createTabId())
        ensureTabQuery()
      }
    }
    channel.postMessage({ type: 'claim', tabId, nonce })
    installTabFetch(getTabId())
    installHistoryPatch()
    ensureTabQuery()
    return () => channel.close()
  }, [])

  useEffect(() => {
    clearLegacyAuthCookies()
    if (!isAuthCallbackLocation(window.location.href) && !window.location.pathname.startsWith('/reset-password')) {
      void createClient().auth.getSession()
    }
  }, [])

  return children
}
