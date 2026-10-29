import type { SupabaseClient } from '@supabase/supabase-js'
import { createOrderFromCheckout } from '@/app/checkout/order'
import { notifyPaymentResult } from '@/lib/notifications'
import { markCheckoutFailedIfUnpaid } from '@/lib/payments/checkout-state'
import type { VerifyResult } from '@/lib/payments/types'

export type SettleOutcome = 'paid' | 'failed' | 'processing' | 'already_resolved'

/**
 * Applies an AUTHORITATIVE provider verification (PayU Verify Payment API, with the amount already compared to what
 * we charged) to one payment. Shared by the PayU callback and the customer's "Check payment status" action so both
 * behave identically:
 *  - an unreadable/ambiguous answer leaves the payment 'processing' (never guessed paid or failed);
 *  - paid / failed are applied with a conditional update, so only the caller that actually flips the row out of
 *    pending/processing continues. A duplicate or concurrent call gets 'already_resolved' and does nothing else
 *    (no second order, no second notification);
 *  - the customer is notified of a paid payment only once the order exists (the message carries the order number);
 *    if order creation failed, the repair paths (confirmation page, initiatePayment, reconcile job) notify later.
 */
export async function settleVerifiedPayment(
  admin: SupabaseClient,
  payment: { id: string; checkout_id: string },
  verification: VerifyResult,
  callbackFields?: Record<string, string>,
): Promise<SettleOutcome> {
  if (!verification.ok) {
    const update: Record<string, unknown> = { status: 'processing' }
    if (callbackFields) update.raw_response = callbackFields
    await admin.from('storefront_payments').update(update).eq('id', payment.id).in('status', ['pending', 'processing'])
    return 'processing'
  }

  if (verification.status === 'paid') {
    const { data: claimed } = await admin
      .from('storefront_payments')
      .update({
        status: 'paid',
        provider_reference: verification.providerReference,
        raw_response: verification.raw as object,
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['pending', 'processing'])
      .select('id')
      .maybeSingle()
    if (!claimed) return 'already_resolved'

    const orderResult = await createOrderFromCheckout(payment.checkout_id, { reference: verification.providerReference })
    if ('error' in orderResult) {
      // Payment is genuinely verified paid even if order creation hit a snag - don't lose that fact.
      await admin.from('storefront_payments').update({ failure_reason: `Paid but order creation failed: ${orderResult.error}` }).eq('id', payment.id)
    } else {
      await notifyPaymentResult(payment.id)
    }
    return 'paid'
  }

  const { data: claimed } = await admin
    .from('storefront_payments')
    .update({ status: 'failed', failure_reason: verification.failureReason, raw_response: verification.raw as object })
    .eq('id', payment.id)
    .in('status', ['pending', 'processing'])
    .select('id')
    .maybeSingle()
  if (!claimed) return 'already_resolved'
  await markCheckoutFailedIfUnpaid(admin, payment.checkout_id)
  await notifyPaymentResult(payment.id)
  return 'failed'
}
