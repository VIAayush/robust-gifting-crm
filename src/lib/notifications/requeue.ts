/**
 * Rules for re-queueing WhatsApp messages that were SKIPPED only because no provider was connected yet.
 * Pure, so the safety rules are unit-tested. Nothing else is ever re-queued:
 *  - messages skipped for a missing phone number stay skipped (nothing could have been sent);
 *  - failed messages keep their own retry path;
 *  - email ledger rows (channel 'email') are never touched;
 *  - messages older than the window are left alone, so a customer is never sent a stale "thanks for your order".
 */
export const PROVIDER_SKIP_REASON = 'No WhatsApp provider configured (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)'
export const PROVIDER_SKIP_PREFIX = 'No WhatsApp provider configured'
export const DEFAULT_REQUEUE_MAX_AGE_DAYS = 7
export const REQUEUE_BATCH_LIMIT = 200

export type OutboxRow = {
  status: string
  channel: string | null
  recipient_phone: string | null
  last_error: string | null
  created_at: string
}

export function requeueMaxAgeMs(envValue: string | undefined): number {
  const days = Number(envValue)
  const valid = Number.isFinite(days) && days > 0 && days <= 90 ? days : DEFAULT_REQUEUE_MAX_AGE_DAYS
  return valid * 24 * 60 * 60 * 1000
}

export function isRequeueable(row: OutboxRow, now: number, maxAgeMs: number): boolean {
  if (row.status !== 'skipped') return false
  if ((row.channel || 'whatsapp') !== 'whatsapp') return false
  if (!row.recipient_phone) return false
  if (!(row.last_error || '').startsWith(PROVIDER_SKIP_PREFIX)) return false
  const created = new Date(row.created_at).getTime()
  return Number.isFinite(created) && now - created <= maxAgeMs
}
