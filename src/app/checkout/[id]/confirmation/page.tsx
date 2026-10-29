import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, isUuid } from '@/lib/utils'
import { asFormAction } from '@/lib/form-action'
import { checkPaymentStatus, initiatePayment } from '../actions'
import { ClearCartOnMount } from '@/components/site/clear-cart-on-mount'
import { loadConfirmation } from '@/lib/checkout/confirmation-load'
import { trackOrderHref } from '@/lib/checkout/confirmation-state'

// Always rendered fresh from the database: a cached "paid" or "pending" screen would be wrong.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Order status', robots: { index: false, follow: false } }

const primaryButton = 'inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white sm:w-auto'
const secondaryLink = 'inline-flex min-h-11 items-center justify-center border border-[#E2E8F0] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5C6570]'

/**
 * Reachable only with the checkout's unguessable UUID (no new auth scheme). It shows the delivery area and items but
 * never the customer's email or phone, and an order is presented as confirmed only when a verified paid payment exists.
 */
export default async function CheckoutConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const admin = createAdminClient()
  if (!admin) notFound()

  const view = await loadConfirmation(admin, id)
  if (!view) notFound()
  const { checkout, items, state } = view

  if (state === 'confirmed' && view.orderNumber) {
    const orderNumber = view.orderNumber
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <ClearCartOnMount />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700">Order confirmed</p>
        <h1 className="mt-2 font-serif text-3xl text-[#1B2430]">#{orderNumber}</h1>
        <p className="mt-3 text-sm text-[#5C6570]">
          Please keep this order number. To track your order, enter it along with the email address you used at checkout.
        </p>
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
          {items.map((item, i) => {
            const product = (Array.isArray(item.product) ? item.product[0] : item.product) as { name?: string } | null | undefined
            const variant = (Array.isArray(item.variant) ? item.variant[0] : item.variant) as { colour?: string; display_name?: string } | null | undefined
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
        <Link href={trackOrderHref(orderNumber)} className="mt-8 ml-3 inline-flex px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9C7A33]">
          Track this order
        </Link>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Payment unsuccessful</p>
        <h1 className="mt-2 font-serif text-2xl text-[#1B2430]">We couldn&apos;t complete this payment.</h1>
        {view.failureReason ? <p className="mt-2 text-sm text-[#5C6570]">{view.failureReason}</p> : null}
        <p className="mt-2 text-sm text-[#5C6570]">Your cart has not been changed — you can try again.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <form action={asFormAction(initiatePayment)}>
            <input type="hidden" name="checkout_id" value={id} />
            <button type="submit" className={primaryButton}>
              Try Again
            </button>
          </form>
          <Link href="/cart" className={secondaryLink}>
            Return to Cart
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'finalising') {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9C7A33]">Payment received</p>
        <h1 className="mt-2 font-serif text-2xl text-[#1B2430]">We&apos;re finalising your order.</h1>
        <p className="mt-2 text-sm text-[#5C6570]">
          Your payment has been received and you have not been charged twice. Your order number will appear here in a moment — please refresh this page shortly.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/checkout/${id}/confirmation`} className={primaryButton}>
            Refresh
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'pending') {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9C7A33]">Payment not confirmed yet</p>
        <h1 className="mt-2 font-serif text-2xl text-[#1B2430]">We&apos;re waiting to hear about your payment.</h1>
        <p className="mt-2 text-sm text-[#5C6570]">
          Your order is not placed until the payment is confirmed. If you have already paid, please do not pay again: use the button below or refresh this page shortly.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {view.action === 'verify' ? (
            <form action={asFormAction(checkPaymentStatus)}>
              <input type="hidden" name="checkout_id" value={id} />
              <button type="submit" className={primaryButton}>
                Check payment status
              </button>
            </form>
          ) : (
            <Link href={`/checkout/${id}/pay`} className={primaryButton}>
              Back to payment
            </Link>
          )}
          <Link href="/cart" className={secondaryLink}>
            Return to Cart
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14 text-center">
      <h1 className="font-serif text-2xl text-[#1B2430]">We can&apos;t show an order for this checkout yet.</h1>
      <p className="mt-2 text-sm text-[#5C6570]">No confirmed payment was found. If you have paid, please contact us before paying again.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/checkout/${id}/review`} className={primaryButton}>
          Back to checkout
        </Link>
        <Link href="/cart" className={secondaryLink}>
          Return to Cart
        </Link>
      </div>
    </div>
  )
}
