'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveProviderName } from '@/lib/payments'
import { createOrderFromCheckout } from '@/app/checkout/order'

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
  if (!checkoutId || !paymentId) redirect('/cart')

  const admin = createAdminClient()
  if (!admin) redirect(`/checkout/${checkoutId}/pay`)

  const { data: payment } = await admin.from('storefront_payments').select('id, status, provider').eq('id', paymentId).single()
  if (!payment || payment.provider !== 'demo' || payment.status !== 'pending') redirect(`/checkout/${checkoutId}/pay`)

  if (outcome === 'success') {
    await admin
      .from('storefront_payments')
      .update({ status: 'paid', provider_reference: `DEMO-${paymentId.slice(0, 8)}`, verified_at: new Date().toISOString() })
      .eq('id', paymentId)
    const result = await createOrderFromCheckout(checkoutId)
    if ('error' in result) redirect(`/checkout/${checkoutId}/review?error=${encodeURIComponent(result.error)}`)
    redirect(`/checkout/${checkoutId}/confirmation`)
  }

  if (outcome === 'failure') {
    await admin.from('storefront_payments').update({ status: 'failed', failure_reason: 'Simulated failure (Demo Payment Mode)' }).eq('id', paymentId)
    await admin.from('storefront_checkouts').update({ status: 'failed' }).eq('id', checkoutId)
    redirect(`/checkout/${checkoutId}/confirmation`)
  }

  // Cancel: leave the payment row as-is (still 'pending' is wrong — mark cancelled so it's not retried as the same attempt), cart/checkout untouched, back to review.
  await admin.from('storefront_payments').update({ status: 'cancelled' }).eq('id', paymentId)
  redirect(`/checkout/${checkoutId}/review`)
}
