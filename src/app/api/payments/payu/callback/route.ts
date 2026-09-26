import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PayuPaymentProvider } from '@/lib/payments'
import { createOrderFromCheckout } from '@/app/checkout/order'
import { notifyPaymentResult } from '@/lib/notifications'

/**
 * PayU's surl AND furl both point here (same fields either way,
 * differentiated by the `status` field) — see payu-provider.ts for where
 * these URLs are generated. This is also where a separately-configured PayU
 * webhook would point, since the handling is identical either way.
 *
 * Never marks a payment paid from this POST body alone: the reverse hash
 * only proves the payload wasn't tampered with in transit, so the actual
 * paid/failed decision comes from a second, authoritative call to PayU's
 * Verify Payment API. Idempotent — a duplicate callback for an
 * already-resolved payment is a no-op redirect, never a second order.
 */
export async function POST(request: Request) {
  const admin = createAdminClient()
  if (!admin) return NextResponse.redirect(new URL('/cart', request.url), 303)

  const form = await request.formData()
  const fields: Record<string, string> = {}
  for (const [key, value] of form.entries()) fields[key] = String(value)

  const txnId = fields.txnid
  if (!txnId) return NextResponse.redirect(new URL('/cart', request.url), 303)

  const { data: payment } = await admin.from('storefront_payments').select('*').eq('provider_txn_id', txnId).maybeSingle()
  if (!payment) return NextResponse.redirect(new URL('/cart', request.url), 303)

  const checkoutUrl = new URL(`/checkout/${payment.checkout_id}/confirmation`, request.url)

  // Already resolved (a duplicate callback delivery) — don't reprocess.
  if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'cancelled') {
    return NextResponse.redirect(checkoutUrl, 303)
  }

  const provider = new PayuPaymentProvider()

  if (!provider.verifyRedirectHash(fields)) {
    await admin
      .from('storefront_payments')
      .update({ status: 'failed', failure_reason: 'Response hash did not match — possible tampering.', raw_response: fields })
      .eq('id', payment.id)
    return NextResponse.redirect(checkoutUrl, 303)
  }

  const verification = await provider.verifyTransaction(txnId)

  if (!verification.ok) {
    // Could not reach PayU / ambiguous response — leave status as 'processing' rather than guessing paid or failed.
    await admin.from('storefront_payments').update({ status: 'processing', raw_response: fields }).eq('id', payment.id)
    return NextResponse.redirect(checkoutUrl, 303)
  }

  // Atomic claim: only the caller whose conditional update actually flips the
  // row out of pending/processing proceeds. Two concurrent duplicate
  // callbacks can both pass the status check above, but only one wins here.
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
    if (!claimed) return NextResponse.redirect(checkoutUrl, 303)

    const orderResult = await createOrderFromCheckout(payment.checkout_id, { reference: verification.providerReference })
    if ('error' in orderResult) {
      // Payment is genuinely verified paid even if order creation hit a snag — don't lose that fact.
      await admin.from('storefront_payments').update({ failure_reason: `Paid but order creation failed: ${orderResult.error}` }).eq('id', payment.id)
    }
    await notifyPaymentResult(payment.id)
  } else {
    const { data: claimed } = await admin
      .from('storefront_payments')
      .update({ status: 'failed', failure_reason: verification.failureReason, raw_response: verification.raw as object })
      .eq('id', payment.id)
      .in('status', ['pending', 'processing'])
      .select('id')
      .maybeSingle()
    if (!claimed) return NextResponse.redirect(checkoutUrl, 303)
    await admin.from('storefront_checkouts').update({ status: 'failed' }).eq('id', payment.checkout_id)
    await notifyPaymentResult(payment.id)
  }

  return NextResponse.redirect(checkoutUrl, 303)
}
