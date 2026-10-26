/**
 * Allowed e-mail domains for a company's portal users (e.g. "acme.com").
 * An empty list means no restriction, so existing companies keep working.
 */

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export const MAX_ALLOWED_DOMAINS = 20

/** Lower-cases, strips a leading "@" / "www." / protocol and any path. Returns '' for junk. */
export function normalizeDomain(raw: string): string {
  let value = String(raw || '').trim().toLowerCase()
  value = value.replace(/^[a-z]+:\/\//, '').replace(/^@/, '').replace(/^www\./, '')
  value = value.split(/[/?#]/)[0]
  return DOMAIN_RE.test(value) ? value : ''
}

/** Parses a comma / space / newline separated list. Reports every entry that is not a valid domain. */
export function parseDomainList(input: string): { domains: string[]; invalid: string[] } {
  const parts = String(input || '')
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const domains: string[] = []
  const invalid: string[] = []
  for (const part of parts) {
    const domain = normalizeDomain(part)
    if (!domain) invalid.push(part)
    else if (!domains.includes(domain)) domains.push(domain)
  }
  return { domains, invalid }
}

export function emailDomain(email: string): string {
  const at = String(email || '').trim().toLowerCase().lastIndexOf('@')
  return at < 0 ? '' : email.trim().toLowerCase().slice(at + 1)
}

/** True when the list is empty (no restriction) or the e-mail's domain is listed. Sub-domains are not implied. */
export function emailAllowed(email: string, allowed: string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(emailDomain(email))
}
