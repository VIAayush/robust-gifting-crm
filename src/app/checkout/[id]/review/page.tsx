import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, isUuid } from '@/lib/utils'
import { asFormAction } from '@/lib/form-action'
import { initiatePayment } from '../actions'
import { formatCustomization } from '@/lib/products/customization'

export default async function CheckoutReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  if (!isUuid(id)) notFound()

  const admin = createAdminClient()
  if (!admin) notFound()

  const { data: checkout } = await admin.from('storefront_checkouts').select('*').eq('id', id).single()
  if (!checkout) notFound()
  if (checkout.order_id) redirect(`/checkout/${id}/confirmation`)

  const { data: items } = await admin
    .from('storefront_checkout_items')
    .select('*, product:products(name, image_url), variant:product_variants(colour, display_name)')
    .eq('checkout_id', id)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/checkout" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]">
        ← Back
      </Link>
      <h1 className="mt-4 font-serif text-2xl text-[#1B2430] sm:text-3xl">Review your order</h1>

      {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="mt-6 divide-y divide-[#E2E8F0] rounded-md border border-[#E2E8F0]">
        {(items || []).map((item) => {
          const product = Array.isArray(item.product) ? item.product[0] : item.product
          const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
          const customization = item.customization as Record<string, string> | null
          return (
            <div key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#1B2430]">{product?.name || 'Product'}</p>
                <p className="text-sm text-[#5C6570]">
                  {item.quantity} × {formatCurrency(item.unit_price)}
                </p>
              </div>
              {variant?.colour ? <p className="mt-1 text-xs text-[#5C6570]">Colour: {variant.display_name || variant.colour}</p> : null}
              {customization && Object.keys(customization).length > 0 ? (
                <p className="mt-1 text-xs text-[#5C6570]">{formatCustomization(customization)}</p>
              ) : null}
              <p className="mt-1 text-right text-sm font-semibold text-[#1B2430]">{formatCurrency(item.line_total)}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-6 space-y-2 rounded-md border border-[#E2E8F0] bg-[#F5F7FA] p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[#5C6570]">Subtotal</span>
          <span>{formatCurrency(checkout.subtotal)}</span>
        </div>
        {checkout.delivery_charge > 0 ? (
          <div className="flex justify-between">
            <span className="text-[#5C6570]">Delivery</span>
            <span>{formatCurrency(checkout.delivery_charge)}</span>
          </div>
        ) : null}
        {checkout.tax_amount > 0 ? (
          <div className="flex justify-between">
            <span className="text-[#5C6570]">Tax</span>
            <span>{formatCurrency(checkout.tax_amount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-[#E2E8F0] pt-2 text-base font-semibold text-[#1B2430]">
          <span>Total</span>
          <span>{formatCurrency(checkout.total_amount)}</span>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-[#E2E8F0] p-4 text-sm text-[#5C6570]">
        <p className="font-semibold text-[#1B2430]">Deliver to</p>
        <p className="mt-1">{checkout.customer_name}</p>
        <p>{checkout.delivery_address_line}</p>
        <p>
          {checkout.delivery_city}
          {checkout.delivery_state ? `, ${checkout.delivery_state}` : ''} {checkout.delivery_postal_code || ''}
        </p>
        <p>{checkout.customer_email} · {checkout.customer_phone}</p>
      </div>

      <form action={asFormAction(initiatePayment)} className="mt-8">
        <input type="hidden" name="checkout_id" value={id} />
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#7C6224]"
        >
          Pay {formatCurrency(checkout.total_amount)}
        </button>
      </form>
    </div>
  )
}
