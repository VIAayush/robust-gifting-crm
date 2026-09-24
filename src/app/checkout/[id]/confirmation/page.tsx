import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, isUuid } from '@/lib/utils'
import { asFormAction } from '@/lib/form-action'
import { initiatePayment } from '../actions'
import { ClearCartOnMount } from '@/components/site/clear-cart-on-mount'

export default async function CheckoutConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const admin = createAdminClient()
  if (!admin) notFound()

  const { data: checkout } = await admin.from('storefront_checkouts').select('*').eq('id', id).single()
  if (!checkout) notFound()

  const [{ data: order }, { data: latestPayment }, { data: items }] = await Promise.all([
    checkout.order_id ? admin.from('orders').select('order_number, status').eq('id', checkout.order_id).single() : Promise.resolve({ data: null }),
    admin.from('storefront_payments').select('*').eq('checkout_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin
      .from('storefront_checkout_items')
      .select('quantity, line_total, product:products(name), variant:product_variants(colour, display_name)')
      .eq('checkout_id', id),
  ])

  const paid = Boolean(checkout.order_id) && order
  const failed = !paid && latestPayment && ['failed', 'cancelled'].includes(latestPayment.status)

  if (paid) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <ClearCartOnMount />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700">Order confirmed</p>
        <h1 className="mt-2 font-serif text-3xl text-[#1B2430]">#{order!.order_number}</h1>
        <div className="mt-6 space-y-2 rounded-md border border-[#E2E8F0] bg-[#F5F7FA] p-5 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-[#5C6570]">Payment</span>
            <span className="font-semibold text-green-700">Paid</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#5C6570]">Status</span>
            <span className="font-semibold text-[#1B2430]">Order received</span>
          </div>
          <div className="flex justify-between border-t border-[#E2E8F0] pt-2">
            <span className="text-[#5C6570]">Total</span>
            <span className="font-semibold text-[#1B2430]">{formatCurrency(checkout.total_amount)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-1 rounded-md border border-[#E2E8F0] p-4 text-left text-xs text-[#5C6570]">
          {(items || []).map((item, i) => {
            const product = Array.isArray(item.product) ? item.product[0] : item.product
            const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
            return (
              <p key={i}>
                {item.quantity} × {product?.name}
                {variant?.colour ? ` (${variant.display_name || variant.colour})` : ''} — {formatCurrency(item.line_total)}
              </p>
            )
          })}
        </div>

        <p className="mt-4 text-xs text-[#5C6570]">
          Delivering to {checkout.delivery_address_line}, {checkout.delivery_city}
        </p>

        <Link href="/personalized" className="mt-8 inline-flex bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
          Continue shopping
        </Link>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Payment unsuccessful</p>
        <h1 className="mt-2 font-serif text-2xl text-[#1B2430]">We couldn&apos;t complete this payment.</h1>
        {latestPayment?.failure_reason ? <p className="mt-2 text-sm text-[#5C6570]">{latestPayment.failure_reason}</p> : null}
        <p className="mt-2 text-sm text-[#5C6570]">Your cart has not been changed — you can try again.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <form action={asFormAction(initiatePayment)}>
            <input type="hidden" name="checkout_id" value={id} />
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white sm:w-auto">
              Try Again
            </button>
          </form>
          <Link href="/cart" className="inline-flex min-h-11 items-center justify-center border border-[#E2E8F0] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5C6570]">
            Return to Cart
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14 text-center">
      <p className="font-serif text-xl text-[#1B2430]">Payment is still being processed…</p>
      <p className="mt-2 text-sm text-[#5C6570]">Refresh this page in a moment, or check back from your email confirmation.</p>
    </div>
  )
}
