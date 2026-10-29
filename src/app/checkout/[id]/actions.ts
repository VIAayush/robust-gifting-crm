'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { PayuPaymentProvider, getActiveProviderName } from '@/lib/payments'
import { settleVerifiedPayment } from '@/lib/payments/settle'
import { createOrderFromCheckout } from '@/app/checkout/order'
import { notifyPaymentResult } from '@/lib/notifications'
import { markCheckoutFailedIfUnpaid } from '@/lib/payments/checkout-state'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function generateTxnId() {
  return `RG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

/** Starts a fresh payment attempt for this checkout (used on "Pay Now" and on "Try Again" after a failure). */
export async function initiatePayment(formData: FormData) {
  const checkoutId = String(formData.get('checkout_id') || '')
  if (!checkoutId) redirect('/cart')

  const admin = createAdminClient()
  if (!admin) redirect(`/checkout/${checkoutId}/review?error=${encodeURIComponent('Unable to start payment just now.')}`)

  const { data: checkout } = await admin.from('storefront_checkouts').select('id, order_id, total_amount').eq('id', checkoutId).single()
  if (!checkout) redirect('/cart')
  if (checkout.order_id) redirect(`/checkout/${checkoutId}/confirmation`)

  // Never start a second attempt for money that is already taken (or may have been): the customer would be charged twice.
  const { data: existing } = await admin.from('storefront_payments').select('id, status, provider, provider_reference').eq('checkout_id', checkoutId).in('status', ['paid', 'processing'])
  const paid = (existing || []).find((p) => p.status === 'paid')
  if (paid) {
    // Paid but the order was never created (an interrupted callback/redirect): repair it. Idempotent - it can only ever
    // produce one order. The payment notification is deduped per payment, so repeating this never re-notifies.
    const repaired = await createOrderFromCheckout(checkoutId, { reference: paid.provider_reference ?? null })
    if (!('error' in repaired)) await notifyPaymentResult(paid.id)
    redirect(`/checkout/${checkoutId}/confirmation`)
  }
  // A PayU payment whose outcome could not be confirmed yet may still turn out paid: wait for it instead of charging again.
  if ((existing || []).some((p) => p.status === 'processing' && p.provider === 'payu')) redirect(`/checkout/${checkoutId}/confirmation`)

  const { error } = await admin.from('storefront_payments').insert({
    checkout_id: checkoutId,
    provider: getActiveProviderName(),
    provider_txn_id: generateTxnId(),
    status: 'pending',
    amount: checkout.total_amount,
  })
  if (error) redirect(`/checkout/${checkoutId}/review?error=${encodeURIComponent(error.message)}`)

  redirect(`/checkout/${checkoutId}/pay`)
}

/**
 * Demo Payment Mode only — simulates what a real gateway callback would do.
 * Never reachable when PayU is the active provider (see the [id]/pay page).
 */
export async function completeDemoPayment(formData: FormData) {
  const checkoutId = String(formData.get('checkout_id') || '')
  const paymentId = String(formData.get('payment_id') || '')
  const outcome = String(formData.get('outcome') || '')
  if (!UUID.test(checkoutId) || !UUID.test(paymentId)) redirect('/cart')
  // Demo completion is a simulation: it must be impossible once a real provider is configured.
  if (getActiveProviderName() !== 'demo') redirect(`/checkout/${checkoutId}/review`)

  const admin = createAdminClient()
  if (!admin) redirect(`/checkout/${checkoutId}/pay`)

  const { data: payment } = await admin.from('storefront_payments').select('id, status, provider, checkout_id').eq('id', paymentId).single()
  // The payment must belong to THIS checkout, otherwise a pair of mismatched ids could pay for someone else's order.
  if (!payment || payment.provider !== 'demo' || payment.checkout_id !== checkoutId || payment.status !== 'pending') redirect(`/checkout/${checkoutId}/pay`)

  if (outcome === 'success') {
    const reference = `DEMO-${paymentId.slice(0, 8)}`
    const { data: claimed } = await admin
      .from('storefront_payments')
      .update({ status: 'paid', provider_reference: reference, verified_at: new Date().toISOString() })
      .eq('id', paymentId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) redirect(`/checkout/${checkoutId}/confirmation`)
    // The payment is paid from here on. If order creation fails, never send the customer back to pay again: the
    // confirmation page (and initiatePayment / the reconcile job) finish the order from the paid payment.
    const result = await createOrderFromCheckout(checkoutId, { reference })
    if (!('error' in result)) await notifyPaymentResult(paymentId)
    redirect(`/checkout/${checkoutId}/confirmation`)
  }

  if (outcome === 'failure') {
    const { data: claimed } = await admin
      .from('storefront_payments')
      .update({ status: 'failed', failure_reason: 'Simulated failure (Demo Payment Mode)' })
      .eq('id', paymentId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (claimed) {
      await markCheckoutFailedIfUnpaid(admin, checkoutId)
      await notifyPaymentResult(paymentId)
    }
    redirect(`/checkout/${checkoutId}/confirmation`)
  }

  // Cancel: mark this attempt cancelled so it's never reused; cart/checkout untouched, back to review for a fresh attempt.
  await admin.from('storefront_payments').update({ status: 'cancelled' }).eq('id', paymentId).eq('status', 'pending')
  redirect(`/checkout/${checkoutId}/review`)
}

/**
 * "Check payment status" on the confirmation page: re-asks PayU (Verify Payment API, amount-checked) about a PayU
 * payment stuck in 'processing' and applies the answer exactly like the callback does. Takes only the checkout id,
 * picks the payment itself, and is a no-op for anything else (demo payments have no external truth to check).
 */
export async function checkPaymentStatus(formData: FormData) {
  const checkoutId = String(formData.get('checkout_id') || '')
  if (!UUID.test(checkoutId)) redirect('/cart')
  const confirmation = `/checkout/${checkoutId}/confirmation`

  const admin = createAdminClient()
  if (!admin) redirect(confirmation)

  const { data: payment } = await admin
    .from('storefront_payments')
    .select('id, checkout_id, provider, provider_txn_id, status, amount')
    .eq('checkout_id', checkoutId)
    .eq('provider', 'payu')
    .eq('status', 'processing')
    .limit(1)
    .maybeSingle()
  if (!payment) redirect(confirmation)

  const verification = await new PayuPaymentProvider().verifyTransaction(payment.provider_txn_id, Number(payment.amount))
  await settleVerifiedPayment(admin, payment, verification)
  redirect(confirmation)
}
