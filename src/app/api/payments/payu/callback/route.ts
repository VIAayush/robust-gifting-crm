import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PayuPaymentProvider } from '@/lib/payments'
import { settleVerifiedPayment } from '@/lib/payments/settle'

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

  // Only PayU payments are resolved here; a demo payment's transaction id must never be settled through PayU.
  if (payment.provider !== 'payu') return NextResponse.redirect(new URL('/cart', request.url), 303)

  const checkoutUrl = new URL(`/checkout/${payment.checkout_id}/confirmation`, request.url)

  // Already resolved (a duplicate callback delivery) — don't reprocess.
  if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'cancelled') {
    return NextResponse.redirect(checkoutUrl, 303)
  }

  const provider = new PayuPaymentProvider()

  if (!provider.verifyRedirectHash(fields)) {
    // An unverifiable POST is never allowed to change a payment's state: anyone who knows a transaction id
    // could otherwise fail somebody else's pending payment. Only note it; the real outcome is confirmed
    // with PayU's Verify Payment API or stays pending.
    console.error('[payu] callback hash mismatch for transaction', txnId)
    await admin.from('storefront_payments').update({ raw_response: { note: 'Callback hash mismatch ignored', received_at: new Date().toISOString() } }).eq('id', payment.id).in('status', ['pending', 'processing'])
    return NextResponse.redirect(checkoutUrl, 303)
  }

  const verification = await provider.verifyTransaction(txnId, Number(payment.amount))

  // Only PayU's own Verify Payment answer (amount-checked) decides paid/failed; an unreachable or ambiguous answer
  // leaves the payment 'processing'. The conditional claims inside make a duplicate delivery a no-op.
  await settleVerifiedPayment(admin, payment, verification, fields)

  return NextResponse.redirect(checkoutUrl, 303)
}
