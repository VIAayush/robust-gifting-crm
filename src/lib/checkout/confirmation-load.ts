import type { SupabaseClient } from '@supabase/supabase-js'
import { createOrderFromCheckout } from '@/app/checkout/order'
import { notifyPaymentResult } from '@/lib/notifications'
import { decideConfirmationState, pendingAction, type ConfirmationState, type PaymentLike } from '@/lib/checkout/confirmation-state'

export type ConfirmationView = {
  state: ConfirmationState
  /** Present ONLY when state === 'confirmed'. */
  orderNumber: string | null
  checkout: { id: string; total_amount: number; delivery_address_line: string | null; delivery_city: string | null }
  items: { quantity: number; line_total: number; product?: unknown; variant?: unknown }[]
  failureReason: string | null
  action: 'verify' | 'back_to_payment'
}

type PaymentRow = PaymentLike & { id: string; failure_reason: string | null; provider_reference: string | null }

async function findOrder(admin: SupabaseClient, checkoutId: string, orderId: string | null) {
  const { data: byCheckout } = await admin.from('orders').select('id, order_number').eq('storefront_checkout_id', checkoutId).maybeSingle()
  if (byCheckout) return byCheckout as { id: string; order_number: string }
  if (!orderId) return null
  const { data: byId } = await admin.from('orders').select('id, order_number').eq('id', orderId).maybeSingle()
  return (byId as { id: string; order_number: string } | null) ?? null
}

/**
 * Everything the confirmation page shows, decided server-side from the database only (never from a URL parameter).
 * An order counts as confirmed only together with a verified 'paid' payment. If a payment is paid but the order is
 * missing, the order is finished here through createOrderFromCheckout (idempotent: one order per checkout, enforced by
 * a unique index) - so refreshing the page can never create a second order, payment or notification.
 * Returns null for an unknown checkout. Reads only the columns the page needs, never the customer's email/phone.
 */
export async function loadConfirmation(admin: SupabaseClient, checkoutId: string): Promise<ConfirmationView | null> {
  const { data: checkout } = await admin
    .from('storefront_checkouts')
    .select('id, order_id, total_amount, delivery_address_line, delivery_city')
    .eq('id', checkoutId)
    .maybeSingle()
  if (!checkout) return null

  const [{ data: paymentRows }, { data: items }] = await Promise.all([
    admin.from('storefront_payments').select('id, status, provider, created_at, failure_reason, provider_reference').eq('checkout_id', checkoutId),
    admin
      .from('storefront_checkout_items')
      .select('quantity, line_total, product:products(name), variant:product_variants(colour, display_name)')
      .eq('checkout_id', checkoutId),
  ])
  const payments = (paymentRows || []) as PaymentRow[]

  let order = await findOrder(admin, checkoutId, (checkout.order_id as string | null) ?? null)
  let decision = decideConfirmationState({ hasOrder: Boolean(order), payments })

  if (decision.state === 'finalising' && decision.paid) {
    const paid = payments.find((p) => p.id === decision.paid?.id)
    const repaired = await createOrderFromCheckout(checkoutId, { reference: paid?.provider_reference ?? null })
    if (!('error' in repaired)) {
      order = await findOrder(admin, checkoutId, repaired.orderId)
      decision = decideConfirmationState({ hasOrder: Boolean(order), payments })
      // Deduped per payment, and this branch only runs while the order is missing, so it cannot repeat on refresh.
      if (paid) await notifyPaymentResult(paid.id)
    }
  }

  const failedRow = payments.find((p) => p.id === (decision.latest as PaymentRow | null)?.id)
  return {
    state: decision.state,
    orderNumber: decision.state === 'confirmed' && order ? order.order_number : null,
    checkout: {
      id: checkout.id as string,
      total_amount: Number(checkout.total_amount),
      delivery_address_line: (checkout.delivery_address_line as string | null) ?? null,
      delivery_city: (checkout.delivery_city as string | null) ?? null,
    },
    items: (items || []) as ConfirmationView['items'],
    failureReason: decision.state === 'failed' && failedRow?.provider === 'demo' ? failedRow.failure_reason : null,
    action: pendingAction(decision.latest),
  }
}
