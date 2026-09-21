import { headers } from 'next/headers'

/**
 * On Vercel, VERCEL_PROJECT_PRODUCTION_URL is the project's own canonical
 * production domain (set automatically, no config needed). Used only if the
 * request's Host header is ever missing — the request-header path above
 * should cover normal traffic — so a header-detection gap can never fall
 * back to localhost in production.
 */
function vercelProductionOrigin(): string | null {
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null
}

export async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  if (!host) return vercelProductionOrigin() || 'http://localhost:3000'
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function recoveryRedirectTo() {
  return `${await requestOrigin()}/auth/confirm`
}
