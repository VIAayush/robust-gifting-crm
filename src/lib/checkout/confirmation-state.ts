import { normalizeOrderNumber } from '@/lib/orders/tracking-lookup'

/**
 * What the B2C confirmation page may tell the customer. Pure (no database, no framework), so every case is unit-tested.
 *
 *  confirmed  a payment is verified 'paid' AND the order row exists. The ONLY state that shows an order number.
 *  finalising a payment is verified 'paid' but the order is not created yet (repair is attempted; never shows a number).
 *  pending    the newest attempt is still pending/processing; nothing is confirmed.
 *  failed     no paid payment and the newest attempt failed or was cancelled (the customer may try again).
 *  unknown    nothing to base a claim on: no payments, or an order exists with NO paid payment (inconsistent data
 *             must never be presented as a paid order).
 */
export type ConfirmationState = 'confirmed' | 'finalising' | 'pending' | 'failed' | 'unknown'

export type PaymentLike = { id?: string; status: string; provider?: string | null; created_at?: string | null }

function time(payment: PaymentLike): number {
  const t = payment.created_at ? new Date(payment.created_at).getTime() : NaN
  return Number.isFinite(t) ? t : 0
}

/** Newest first. Stable for equal/missing timestamps: later array entries are treated as newer. */
export function sortPaymentsNewestFirst<T extends PaymentLike>(payments: T[]): T[] {
  return payments
    .map((payment, index) => ({ payment, index }))
    .sort((a, b) => time(b.payment) - time(a.payment) || b.index - a.index)
    .map((entry) => entry.payment)
}

export function decideConfirmationState(input: { hasOrder: boolean; payments: PaymentLike[] }): { state: ConfirmationState; latest: PaymentLike | null; paid: PaymentLike | null } {
  const ordered = sortPaymentsNewestFirst(input.payments)
  const latest = ordered[0] ?? null
  const paid = ordered.find((p) => p.status === 'paid') ?? null

  if (paid) return { state: input.hasOrder ? 'confirmed' : 'finalising', latest, paid }
  if (input.hasOrder) return { state: 'unknown', latest, paid: null }
  if (!latest) return { state: 'unknown', latest, paid: null }
  if (latest.status === 'pending' || latest.status === 'processing') return { state: 'pending', latest, paid: null }
  if (latest.status === 'failed' || latest.status === 'cancelled') return { state: 'failed', latest, paid: null }
  return { state: 'unknown', latest, paid: null }
}

/**
 * The one customer action offered on the pending screen. Re-verifying is only meaningful for a PayU payment that is
 * 'processing' (PayU was unreachable); anything else just goes back to the payment step.
 */
export function pendingAction(latest: PaymentLike | null): 'verify' | 'back_to_payment' {
  return latest && latest.provider === 'payu' && latest.status === 'processing' ? 'verify' : 'back_to_payment'
}

/** Link to the public tracking page, pre-filled with the order number only. Never put an email or phone in a URL. */
export function trackOrderHref(orderNumber: string | null | undefined): string {
  const normalised = normalizeOrderNumber(orderNumber || '')
  return normalised ? `/track-order?order=${encodeURIComponent(normalised)}` : '/track-order'
}
