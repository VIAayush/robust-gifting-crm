/** A quotation is valid through the whole of its valid_until day, in India time. Blank means no expiry. */
export function quotationExpired(validUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!validUntil) return false
  const today = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  return String(validUntil).slice(0, 10) < today
}

export const EXPIRED_MESSAGE = 'This quotation has expired. Please ask us for a refreshed quotation.'
