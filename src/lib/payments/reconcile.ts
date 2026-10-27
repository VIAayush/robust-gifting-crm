/**
 * Safe reconciliation of online payments (no database or network in this file: everything it needs is injected,
 * so the decision rules are unit-tested).
 *
 * Two situations are repaired:
 *  1. A PayU payment left 'pending' or 'processing' because the customer never came back to our page or
 *     PayU's Verify Payment API was unreachable at the time. The AUTHORITATIVE answer is asked from PayU again
 *     (never the browser, never a stored claim) and the payment is resolved only from that answer, with the
 *     amount compared to what we charged.
 *  2. A payment already verified 'paid' whose order was never created (a transient error after the money was
 *     confirmed). The order is created through the same idempotent, resumable function the callback uses, so it
 *     can never produce a second order.
 *
 * It never marks anything paid without PayU confirming it, never touches demo payments (they have no external
 * truth to check), only looks at recent payments, and is safe to run repeatedly or concurrently (state changes
 * are conditional claims).
 */

export type ReconcilePayment = {
  id: string
  checkout_id: string
  provider: string
  provider_txn_id: string
  provider_reference: string | null
  status: string
  amount: number
  created_at: string
  hasOrder: boolean
}

export type VerifyOutcome =
  | { ok: true; status: 'paid'; providerReference: string | null; raw: unknown }
  | { ok: true; status: 'failed'; failureReason: string | null; raw: unknown }
  | { ok: false; error: string }

export type ReconcileDeps = {
  listCandidates: (sinceIso: string) => Promise<ReconcilePayment[]>
  verify: (txnId: string, amount: number) => Promise<VerifyOutcome>
  claimPaid: (paymentId: string, providerReference: string | null, raw: unknown) => Promise<boolean>
  claimFailed: (paymentId: string, reason: string | null, raw: unknown) => Promise<boolean>
  markCheckoutFailed: (checkoutId: string) => Promise<void>
  createOrder: (checkoutId: string, reference: string | null) => Promise<{ orderId: string } | { error: string }>
  setFailureNote: (paymentId: string, note: string | null) => Promise<void>
  notify: (paymentId: string) => Promise<void>
}

export const PENDING_MIN_AGE_MS = 15 * 60 * 1000
export const PROCESSING_MIN_AGE_MS = 5 * 60 * 1000
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type Action = 'verify' | 'repair_order' | 'skip'

export function classifyPayment(payment: Pick<ReconcilePayment, 'status' | 'provider' | 'created_at' | 'hasOrder'>, now: number): Action {
  const created = new Date(payment.created_at).getTime()
  if (!Number.isFinite(created)) return 'skip'
  const age = now - created
  if (age > MAX_AGE_MS) return 'skip'
  if (payment.status === 'paid') return payment.hasOrder ? 'skip' : 'repair_order'
  if (payment.provider !== 'payu') return 'skip'
  if (payment.status === 'processing') return age >= PROCESSING_MIN_AGE_MS ? 'verify' : 'skip'
  if (payment.status === 'pending') return age >= PENDING_MIN_AGE_MS ? 'verify' : 'skip'
  return 'skip'
}

export type ReconcileSummary = {
  checked: number
  markedPaid: number
  markedFailed: number
  ordersCreated: number
  stillPending: number
  errors: number
}

export async function reconcilePayments(deps: ReconcileDeps, now: number = Date.now()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, markedPaid: 0, markedFailed: 0, ordersCreated: 0, stillPending: 0, errors: 0 }
  const candidates = await deps.listCandidates(new Date(now - MAX_AGE_MS).toISOString())

  for (const payment of candidates) {
    const action = classifyPayment(payment, now)
    if (action === 'skip') continue
    summary.checked++

    try {
      if (action === 'repair_order') {
        const result = await deps.createOrder(payment.checkout_id, payment.provider_reference)
        if ('error' in result) {
          summary.errors++
          await deps.setFailureNote(payment.id, `Paid but order creation failed: ${result.error}`)
        } else {
          summary.ordersCreated++
          await deps.setFailureNote(payment.id, null)
          // The customer was never told about this payment; the notification is deduped per payment, so this cannot repeat.
          await deps.notify(payment.id)
        }
        continue
      }

      const verification = await deps.verify(payment.provider_txn_id, payment.amount)
      if (!verification.ok) {
        // PayU unreachable or ambiguous: leave it exactly as it is and try again next run. Never guess.
        summary.stillPending++
        continue
      }

      if (verification.status === 'paid') {
        const claimed = await deps.claimPaid(payment.id, verification.providerReference, verification.raw)
        if (!claimed) continue // another process (callback or a parallel run) resolved it first; it owns the follow-up
        summary.markedPaid++
        const order = await deps.createOrder(payment.checkout_id, verification.providerReference)
        if ('error' in order) {
          summary.errors++
          await deps.setFailureNote(payment.id, `Paid but order creation failed: ${order.error}`)
        } else {
          summary.ordersCreated++
        }
        await deps.notify(payment.id)
      } else {
        const claimed = await deps.claimFailed(payment.id, verification.failureReason, verification.raw)
        if (!claimed) continue
        summary.markedFailed++
        await deps.markCheckoutFailed(payment.checkout_id)
        await deps.notify(payment.id)
      }
    } catch (error) {
      summary.errors++
      console.error('[reconcile] payment failed to reconcile', payment.id, (error as Error).message)
    }
  }
  return summary
}
