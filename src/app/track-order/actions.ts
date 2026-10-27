'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_STATUS_LABELS } from '@/lib/order-workflow'
import { headers } from 'next/headers'
import { RATE_LIMIT_MESSAGE, RATE_RULES, checkRateLimit, clientKeyFromHeaders } from '@/lib/security/rate-limit'
import { isValidTrackingLookup, normalizeOrderNumber } from '@/lib/orders/tracking-lookup'

export type TrackedOrder = {
  orderNumber: string
  statusLabel: string
  placedOn: string
  total: number | null
  items: { description: string; quantity: number }[]
}

export type TrackResult = { order: TrackedOrder } | { error: string }

const NOT_FOUND = 'We could not find an order with those details. Check the order number and the email used at checkout.'

/**
 * Public B2C order lookup. Both the order number and the checkout email must match;
 * every failure returns the same message so the form cannot be used to discover
 * which order numbers exist. Only customer-safe fields are returned (no supplier,
 * cost, margin or internal notes).
 */
export async function trackOrder(orderNumberRaw: string, emailRaw: string): Promise<TrackResult> {
  // Order lookups are rate limited so the form cannot be used to guess order numbers and emails.
  const limitKey = clientKeyFromHeaders(await headers(), RATE_RULES.track.bucket)
  if (!(await checkRateLimit(createAdminClient(), RATE_RULES.track, limitKey))) return { error: RATE_LIMIT_MESSAGE }

  const lookup = isValidTrackingLookup(orderNumberRaw, emailRaw)
  if (!lookup) return { error: 'Enter your order number and the email address used at checkout.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Order tracking is unavailable right now. Please try again shortly.' }

  const { data: order, error } = await admin
    .from('orders')
    .select('id, order_number, status, order_value, created_at, storefront_checkout_id')
    .eq('order_number', normalizeOrderNumber(orderNumberRaw))
    .not('storefront_checkout_id', 'is', null)
    .maybeSingle()
  if (error) {
    console.error('[track-order] lookup failed', error.message)
    return { error: 'Order tracking is unavailable right now. Please try again shortly.' }
  }
  if (!order) return { error: NOT_FOUND }

  const { data: checkout } = await admin
    .from('storefront_checkouts')
    .select('customer_email')
    .eq('id', order.storefront_checkout_id)
    .maybeSingle()
  if (!checkout || String(checkout.customer_email || '').trim().toLowerCase() !== lookup.email) return { error: NOT_FOUND }

  const { data: items } = await admin.from('order_items').select('description, quantity').eq('order_id', order.id)

  return {
    order: {
      orderNumber: order.order_number as string,
      statusLabel: CLIENT_STATUS_LABELS[order.status as string] || String(order.status),
      placedOn: order.created_at as string,
      total: order.order_value == null ? null : Number(order.order_value),
      items: (items || []).map((item) => ({ description: String(item.description || 'Item'), quantity: Number(item.quantity) || 0 })),
    },
  }
}
