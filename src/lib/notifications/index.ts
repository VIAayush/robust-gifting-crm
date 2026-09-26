import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency } from '@/lib/utils'
import { renderTemplate, type TemplateKey } from './templates'
import { getNotificationProvider } from './providers'

export { isWhatsAppConfigured } from './providers'

const MAX_ATTEMPTS = 5

/** Normalises to E.164 digits without '+' (what the WhatsApp Cloud API expects). Assumes India for bare 10-digit numbers. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

type EnqueueInput = {
  eventType: string
  recipientType: 'customer' | 'staff'
  recipientPhone: string | null
  recipientName?: string | null
  recipientProfileId?: string | null
  templateKey: TemplateKey
  payload: Record<string, string>
  entity?: string
  entityId?: string | null
  dedupeKey: string
}

async function enqueue(admin: SupabaseClient, input: EnqueueInput): Promise<string | null> {
  const phone = normalizePhone(input.recipientPhone)
  const rendered = renderTemplate(input.templateKey, input.payload)
  const { data, error } = await admin
    .from('notification_outbox')
    .insert({
      event_type: input.eventType,
      channel: 'whatsapp',
      recipient_type: input.recipientType,
      recipient_phone: phone,
      recipient_name: input.recipientName || null,
      recipient_profile_id: input.recipientProfileId || null,
      template_key: input.templateKey,
      payload: input.payload,
      rendered_message: rendered,
      status: phone ? 'pending' : 'skipped',
      last_error: phone ? null : 'No valid phone number on record for this recipient',
      entity: input.entity || null,
      entity_id: input.entityId || null,
      dedupe_key: input.dedupeKey,
    })
    .select('id')
    .maybeSingle()
  // 23505 = this exact notification was already enqueued (duplicate event) - that's the point of dedupe_key.
  if (error && error.code !== '23505') console.error('[notifications] enqueue failed:', error.message)
  return data?.id || null
}

/**
 * Sends pending rows. Idempotent per row: a row is claimed by flipping
 * attempts only while still 'pending', so two dispatchers never double-send.
 */
export async function dispatchNotifications(admin: SupabaseClient, ids?: string[]) {
  let query = admin.from('notification_outbox').select('*').eq('status', 'pending').lt('attempts', MAX_ATTEMPTS).order('created_at').limit(50)
  if (ids && ids.length > 0) query = query.in('id', ids)
  const { data: rows } = await query
  if (!rows || rows.length === 0) return { sent: 0, failed: 0, skipped: 0 }

  const provider = getNotificationProvider()
  const summary = { sent: 0, failed: 0, skipped: 0 }

  for (const row of rows) {
    const { data: claimed } = await admin
      .from('notification_outbox')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('attempts', row.attempts)
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    if (!provider) {
      await admin
        .from('notification_outbox')
        .update({ status: 'skipped', last_error: 'No WhatsApp provider configured (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)' })
        .eq('id', row.id)
      summary.skipped++
      continue
    }

    const result = await provider.send({
      to: row.recipient_phone,
      templateKey: row.template_key as TemplateKey,
      payload: row.payload as Record<string, string>,
      text: row.rendered_message || '',
    })

    if (result.ok) {
      await admin
        .from('notification_outbox')
        .update({ status: 'sent', provider: provider.name, provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id)
      summary.sent++
    } else {
      const giveUp = !result.retryable || row.attempts + 1 >= MAX_ATTEMPTS
      await admin
        .from('notification_outbox')
        .update({ status: giveUp ? 'failed' : 'pending', provider: provider.name, last_error: result.error })
        .eq('id', row.id)
      summary.failed++
    }
  }
  return summary
}

async function enqueueAndDispatch(admin: SupabaseClient, inputs: EnqueueInput[]) {
  const ids = (await Promise.all(inputs.map((input) => enqueue(admin, input)))).filter((id): id is string => Boolean(id))
  if (ids.length > 0) await dispatchNotifications(admin, ids)
}

/** Staff alert numbers: explicit profile phones plus NOTIFY_STAFF_PHONES (comma-separated), deduped. */
async function staffRecipients(admin: SupabaseClient, profileIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(profileIds.filter((id): id is string => Boolean(id))))
  const recipients: { phone: string; name: string | null; profileId: string | null }[] = []
  if (ids.length > 0) {
    const { data } = await admin.from('profiles').select('id, full_name, phone').in('id', ids).eq('is_active', true)
    for (const p of data || []) if (p.phone) recipients.push({ phone: p.phone, name: p.full_name, profileId: p.id })
  }
  for (const raw of (process.env.NOTIFY_STAFF_PHONES || '').split(',')) {
    const phone = raw.trim()
    if (phone && !recipients.some((r) => normalizePhone(r.phone) === normalizePhone(phone))) {
      recipients.push({ phone, name: 'Operations', profileId: null })
    }
  }
  return recipients
}

/** Never throws - a notification problem must never break the business action that triggered it. */
async function safely(label: string, fn: (admin: SupabaseClient) => Promise<void>) {
  try {
    const admin = createAdminClient()
    if (!admin) return
    await fn(admin)
  } catch (error) {
    console.error(`[notifications] ${label} failed:`, (error as Error).message)
  }
}

export function notifyOrderCreated(orderId: string) {
  return safely('order created', async (admin) => {
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, order_type, order_value, owner_id, assigned_to, shipping_address, company:companies(name), contact:contacts(full_name, phone)')
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) throw new Error(orderError.message)
    if (!order) return
    const contact = Array.isArray(order.contact) ? order.contact[0] : order.contact
    const company = Array.isArray(order.company) ? order.company[0] : order.company
    const shipping = (order.shipping_address || {}) as { name?: string; phone?: string }
    const customerName = shipping.name || contact?.full_name || company?.name || 'there'
    const customerPhone = shipping.phone || contact?.phone || null
    const amount = formatCurrency(order.order_value)
    const typeLabel = order.order_type === 'b2c' ? 'online' : 'corporate'

    const inputs: EnqueueInput[] = [
      {
        eventType: 'order_created',
        recipientType: 'customer',
        recipientPhone: customerPhone,
        recipientName: customerName,
        templateKey: 'order_created_customer',
        payload: { customer_name: customerName, order_number: order.order_number, amount },
        entity: 'orders',
        entityId: order.id,
        dedupeKey: `order_created:${order.id}:customer`,
      },
    ]
    for (const staff of await staffRecipients(admin, [order.owner_id, order.assigned_to])) {
      inputs.push({
        eventType: 'order_created',
        recipientType: 'staff',
        recipientPhone: staff.phone,
        recipientName: staff.name,
        recipientProfileId: staff.profileId,
        templateKey: 'order_created_staff',
        payload: { order_number: order.order_number, order_type: typeLabel, customer_name: customerName, amount },
        entity: 'orders',
        entityId: order.id,
        dedupeKey: `order_created:${order.id}:staff:${normalizePhone(staff.phone)}`,
      })
    }
    await enqueueAndDispatch(admin, inputs)
  })
}

export function notifyPaymentResult(paymentId: string) {
  return safely('payment result', async (admin) => {
    const { data: payment, error: paymentError } = await admin
      .from('storefront_payments')
      // Explicit FK hint: storefront_checkouts <-> orders are linked both ways
      // (checkouts.order_id and orders.storefront_checkout_id), so an
      // unqualified embed is ambiguous (PGRST201) and silently returns nothing.
      .select('id, status, amount, checkout:storefront_checkouts(customer_name, customer_phone, order:orders!storefront_checkouts_order_id_fkey(order_number))')
      .eq('id', paymentId)
      .maybeSingle()
    if (paymentError) throw new Error(paymentError.message)
    if (!payment || (payment.status !== 'paid' && payment.status !== 'failed')) return
    const checkout = Array.isArray(payment.checkout) ? payment.checkout[0] : payment.checkout
    if (!checkout) return
    const order = Array.isArray(checkout.order) ? checkout.order[0] : checkout.order
    const amount = formatCurrency(payment.amount)
    const paid = payment.status === 'paid'
    await enqueueAndDispatch(admin, [
      {
        eventType: paid ? 'payment_success' : 'payment_failed',
        recipientType: 'customer',
        recipientPhone: checkout.customer_phone,
        recipientName: checkout.customer_name,
        templateKey: paid ? 'payment_success_customer' : 'payment_failed_customer',
        payload: { customer_name: checkout.customer_name, amount, order_number: order?.order_number || '' },
        entity: 'storefront_payments',
        entityId: payment.id,
        dedupeKey: `payment:${payment.id}:${payment.status}`,
      },
    ])
  })
}

export function notifyOrderStatusChanged(orderId: string, statusLabel: string) {
  return safely('order status', async (admin) => {
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, status, assigned_to, owner_id, shipping_address, contact:contacts(full_name, phone), company:companies(name)')
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) throw new Error(orderError.message)
    if (!order) return
    const contact = Array.isArray(order.contact) ? order.contact[0] : order.contact
    const company = Array.isArray(order.company) ? order.company[0] : order.company
    const shipping = (order.shipping_address || {}) as { name?: string; phone?: string }
    const customerName = shipping.name || contact?.full_name || company?.name || 'there'
    const inputs: EnqueueInput[] = [
      {
        eventType: 'order_status_changed',
        recipientType: 'customer',
        recipientPhone: shipping.phone || contact?.phone || null,
        recipientName: customerName,
        templateKey: 'order_status_customer',
        payload: { customer_name: customerName, order_number: order.order_number, status: statusLabel },
        entity: 'orders',
        entityId: order.id,
        dedupeKey: `order_status:${order.id}:${order.status}:customer`,
      },
    ]
    for (const staff of await staffRecipients(admin, [order.assigned_to])) {
      inputs.push({
        eventType: 'order_status_changed',
        recipientType: 'staff',
        recipientPhone: staff.phone,
        recipientName: staff.name,
        recipientProfileId: staff.profileId,
        templateKey: 'order_status_staff',
        payload: { order_number: order.order_number, status: statusLabel },
        entity: 'orders',
        entityId: order.id,
        dedupeKey: `order_status:${order.id}:${order.status}:staff:${normalizePhone(staff.phone)}`,
      })
    }
    await enqueueAndDispatch(admin, inputs)
  })
}

export function notifySampleRequested(sampleRequestId: string) {
  return safely('sample request', async (admin) => {
    const { data: request, error: requestError } = await admin
      .from('sample_requests')
      .select('id, quantity, requested_by, assigned_to, company:companies(name, owner_id), product:products(name)')
      .eq('id', sampleRequestId)
      .maybeSingle()
    if (requestError) throw new Error(requestError.message)
    if (!request) return
    const company = Array.isArray(request.company) ? request.company[0] : request.company
    const product = Array.isArray(request.product) ? request.product[0] : request.product
    const productName = product?.name || 'a product'

    const { data: requester } = request.requested_by
      ? await admin.from('profiles').select('full_name, phone').eq('id', request.requested_by).maybeSingle()
      : { data: null }

    const inputs: EnqueueInput[] = [
      {
        eventType: 'sample_requested',
        recipientType: 'customer',
        recipientPhone: requester?.phone || null,
        recipientName: requester?.full_name || null,
        templateKey: 'sample_request_customer',
        payload: { customer_name: requester?.full_name || 'there', product_name: productName },
        entity: 'sample_requests',
        entityId: request.id,
        dedupeKey: `sample:${request.id}:customer`,
      },
    ]
    for (const staff of await staffRecipients(admin, [company?.owner_id, request.assigned_to])) {
      inputs.push({
        eventType: 'sample_requested',
        recipientType: 'staff',
        recipientPhone: staff.phone,
        recipientName: staff.name,
        recipientProfileId: staff.profileId,
        templateKey: 'sample_request_staff',
        payload: { company_name: company?.name || 'A client', product_name: productName, quantity: String(request.quantity) },
        entity: 'sample_requests',
        entityId: request.id,
        dedupeKey: `sample:${request.id}:staff:${normalizePhone(staff.phone)}`,
      })
    }
    await enqueueAndDispatch(admin, inputs)
  })
}
