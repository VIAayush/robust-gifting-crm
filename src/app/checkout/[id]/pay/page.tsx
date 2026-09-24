import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, isUuid } from '@/lib/utils'
import { asFormAction } from '@/lib/form-action'
import { requestOrigin } from '@/lib/auth/request-origin'
import { PayuPaymentProvider } from '@/lib/payments'
import { completeDemoPayment } from '../actions'

export default async function CheckoutPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const admin = createAdminClient()
  if (!admin) notFound()

  const { data: checkout } = await admin.from('storefront_checkouts').select('*').eq('id', id).single()
  if (!checkout) notFound()
  if (checkout.order_id) redirect(`/checkout/${id}/confirmation`)

  const { data: payment } = await admin
    .from('storefront_payments')
    .select('*')
    .eq('checkout_id', id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!payment) redirect(`/checkout/${id}/review`)

  if (payment.provider === 'payu') {
    const origin = await requestOrigin()
    const provider = new PayuPaymentProvider()
    const { redirect: payuRedirect } = await provider.createPayment({
      checkoutId: id,
      txnId: payment.provider_txn_id,
      amount: Number(payment.amount),
      productInfo: `Robust Gifting order (${id.slice(0, 8)})`,
      customerName: checkout.customer_name,
      customerEmail: checkout.customer_email,
      customerPhone: checkout.customer_phone,
      successUrl: `${origin}/api/payments/payu/callback`,
      failureUrl: `${origin}/api/payments/payu/callback`,
    })
    if (!payuRedirect) redirect(`/checkout/${id}/review?error=${encodeURIComponent('PayU is not configured.')}`)

    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-serif text-xl text-[#1B2430]">Redirecting you to PayU…</p>
        <p className="mt-2 text-sm text-[#5C6570]">Please do not close this window.</p>
        <form action={payuRedirect.actionUrl} method="POST" id="payu-redirect-form">
          {Object.entries(payuRedirect.fields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <noscript>
            <button type="submit" className="mt-6 inline-flex bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              Continue to PayU
            </button>
          </noscript>
        </form>
        <script
          // Auto-submit — the noscript button above covers browsers with JS disabled.
          dangerouslySetInnerHTML={{ __html: `document.getElementById('payu-redirect-form').submit();` }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
        Demo Payment Mode — no real payment gateway is connected
      </div>
      <h1 className="mt-6 text-center font-serif text-2xl text-[#1B2430]">Pay {formatCurrency(payment.amount)}</h1>
      <p className="mt-2 text-center text-sm text-[#5C6570]">
        Choose an outcome to simulate — this is exactly the decision PayU would make for a real card.
      </p>

      <div className="mt-8 space-y-3">
        <form action={asFormAction(completeDemoPayment)}>
          <input type="hidden" name="checkout_id" value={id} />
          <input type="hidden" name="payment_id" value={payment.id} />
          <input type="hidden" name="outcome" value="success" />
          <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center bg-green-700 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-green-800">
            Simulate Success
          </button>
        </form>
        <form action={asFormAction(completeDemoPayment)}>
          <input type="hidden" name="checkout_id" value={id} />
          <input type="hidden" name="payment_id" value={payment.id} />
          <input type="hidden" name="outcome" value="failure" />
          <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center bg-red-700 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-red-800">
            Simulate Failure
          </button>
        </form>
        <form action={asFormAction(completeDemoPayment)}>
          <input type="hidden" name="checkout_id" value={id} />
          <input type="hidden" name="payment_id" value={payment.id} />
          <input type="hidden" name="outcome" value="cancel" />
          <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center border border-[#E2E8F0] bg-white px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5C6570] hover:bg-[#F5F7FA]">
            Cancel
          </button>
        </form>
      </div>
    </div>
  )
}
