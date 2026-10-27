import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency } from '@/lib/utils'
import { renderTemplate, type TemplateKey } from './templates'
import { getNotificationProvider } from './providers'
import { PROVIDER_SKIP_PREFIX, PROVIDER_SKIP_REASON, REQUEUE_BATCH_LIMIT, isRequeueable, requeueMaxAgeMs } from './requeue'
import { requestOrigin } from '@/lib/auth/request-origin'
import { sendEmail } from '@/lib/email/resend'
import { orderEmail, productAvailableEmail, requirementUpdateEmail, staffAlertEmail } from '@/lib/email/templates'

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
        .update({ status: 'skipped', last_error: PROVIDER_SKIP_REASON })
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
      .select('id, order_number, order_type, order_value, owner_id, assigned_to, shipping_address, storefront_checkout_id, company:companies(name), contact:contacts(full_name, phone)')
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
    await emailB2cCustomer(admin, order.id, order.storefront_checkout_id as string | null, order.order_number as string, 'order_created', `Thank you for your order ${order.order_number}`, [`We have received your order (${amount}).`, 'We will keep you posted as it progresses.'])
    await emailStaff(admin, {
      eventType: 'order_created',
      dedupeKey: `email:order_created:${order.id}`,
      entity: 'orders',
      entityId: order.id,
      title: `New ${typeLabel} order ${order.order_number}`,
      lines: [`Customer: ${customerName}`, `Value: ${amount}`],
      path: `/crm/orders/${order.id}`,
    })
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
      .select('id, order_number, status, assigned_to, owner_id, shipping_address, storefront_checkout_id, contact:contacts(full_name, phone), company:companies(name)')
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
    await emailB2cCustomer(admin, order.id, order.storefront_checkout_id as string | null, order.order_number as string, `order_status_${order.status}`, `Your order ${order.order_number} is now: ${statusLabel}`, [`Your Robust Gifting order ${order.order_number} is now: ${statusLabel}.`])
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
    await emailStaff(admin, {
      eventType: 'sample_requested',
      dedupeKey: `email:sample:${request.id}`,
      entity: 'sample_requests',
      entityId: request.id,
      title: `New sample request from ${company?.name || 'a client'}`,
      lines: [`Product: ${productName}`, `Quantity: ${request.quantity}`],
      path: '/crm/samples',
    })
  })
}

/**
 * Requirement workflow events. Staff-side decisions notify the client company's
 * users (WhatsApp outbox + email); client-side actions notify the owner and
 * operations (WhatsApp outbox). In-app notifications are raised by the database
 * function requirement_transition(). Only the requirement name and a short
 * status line are sent - never supplier or cost data.
 */
const REQUIREMENT_UPDATES: Record<string, { audience: 'customer' | 'staff'; text: string }> = {
  submitted: { audience: 'staff', text: 'submitted for review' },
  resubmitted: { audience: 'staff', text: 'resubmitted after changes' },
  changes_requested: { audience: 'customer', text: 'changes were requested' },
  admin_rejected: { audience: 'customer', text: 'it was not accepted' },
  admin_approved: { audience: 'customer', text: 'it was approved - please review and confirm it' },
  client_confirmed: { audience: 'staff', text: 'confirmed by the client' },
  selection_submitted: { audience: 'staff', text: 'product selection submitted for review' },
  selection_changes_requested: { audience: 'customer', text: 'changes were requested on your product selection' },
  selection_approved: { audience: 'customer', text: 'your product selection was approved and your quotation is being prepared' },
  quotation_sent: { audience: 'customer', text: 'your quotation is ready to review' },
  quotation_accepted: { audience: 'staff', text: 'quotation accepted by the client' },
  quotation_rejected: { audience: 'staff', text: 'quotation declined by the client' },
}

export function notifyRequirementEvent(requirementId: string, event: string, note?: string | null) {
  return safely('requirement event', async (admin) => {
    const update = REQUIREMENT_UPDATES[event]
    if (!update) return
    const { data: requirement, error } = await admin
      .from('requirements')
      .select('id, name, company_id, owner_id, submitted_at, company:companies(name)')
      .eq('id', requirementId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!requirement) return
    const company = Array.isArray(requirement.company) ? requirement.company[0] : requirement.company
    const companyName = company?.name || 'A client'
    // submitted_at changes on every (re)submission, so each round is deduped separately.
    const round = String(requirement.submitted_at || '')
    const inputs: EnqueueInput[] = []

    if (update.audience === 'staff') {
      for (const staff of await staffRecipients(admin, [requirement.owner_id])) {
        inputs.push({
          eventType: `requirement_${event}`,
          recipientType: 'staff',
          recipientPhone: staff.phone,
          recipientName: staff.name,
          recipientProfileId: staff.profileId,
          templateKey: 'requirement_update_staff',
          payload: { company_name: companyName, requirement_name: requirement.name, update: update.text },
          entity: 'requirements',
          entityId: requirement.id,
          dedupeKey: `requirement:${requirement.id}:${event}:${round}:staff:${normalizePhone(staff.phone)}`,
        })
      }
    } else {
      const { data: users } = await admin
        .from('profiles')
        .select('id, full_name, email, phone')
        .eq('company_id', requirement.company_id)
        .in('role', ['client_admin', 'client_user'])
        .eq('is_active', true)
      const origin = await requestOrigin()
      for (const user of users || []) {
        inputs.push({
          eventType: `requirement_${event}`,
          recipientType: 'customer',
          recipientPhone: user.phone || null,
          recipientName: user.full_name,
          recipientProfileId: user.id,
          templateKey: 'requirement_update_customer',
          payload: { customer_name: user.full_name || 'there', requirement_name: requirement.name, update: update.text },
          entity: 'requirements',
          entityId: requirement.id,
          dedupeKey: `requirement:${requirement.id}:${event}:${round}:customer:${user.id}`,
        })
        if (user.email) {
          const mail = requirementUpdateEmail({
            name: user.full_name || 'there',
            requirementName: requirement.name,
            update: update.text,
            note: note || null,
            url: `${origin}/portal/requirements/${requirement.id}`,
          })
          const sent = await sendEmail({ to: user.email, ...mail })
          if (!sent.ok) console.error('[notifications] requirement email failed:', sent.error)
        }
      }
    }
    if (inputs.length > 0) await enqueueAndDispatch(admin, inputs)
    if (update.audience === 'staff') {
      await emailStaff(admin, {
        eventType: `requirement_${event}`,
        dedupeKey: `email:requirement:${requirement.id}:${event}:${round}`,
        entity: 'requirements',
        entityId: requirement.id,
        title: `${companyName}: ${update.text}`,
        lines: [`Requirement: ${requirement.name}`, ...(note ? [`Note: ${note}`] : [])],
        path: `/crm/requirements/${requirement.id}`,
      })
    }
  })
}

/**
 * The configured internal alert address (Settings > staff notification email), or null.
 * Tolerates the column not existing yet (migration not applied) - that simply means "not configured".
 */
export async function getStaffNotificationEmail(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from('org_settings').select('staff_notification_email').limit(1).maybeSingle()
  if (error) return null
  const value = String((data as { staff_notification_email?: string | null } | null)?.staff_notification_email || '').trim()
  return value || null
}

/**
 * Emails the configured staff address once per dedupe key. Nothing is sent when no address is configured
 * or e-mail is not set up. The notification_outbox row (channel 'email') is the ledger that prevents a
 * repeated action from sending the same alert twice; it is inserted as 'skipped' so the WhatsApp
 * dispatcher (which only picks up 'pending' rows) never touches it, then flipped to sent/failed.
 */
async function emailOnce(
  admin: SupabaseClient,
  input: {
    recipientType: 'staff' | 'customer'
    to: string
    mail: { subject: string; html: string }
    eventType: string
    dedupeKey: string
    entity: string
    entityId: string
  },
) {
  const { data: ledger, error } = await admin
    .from('notification_outbox')
    .insert({
      event_type: input.eventType,
      channel: 'email',
      recipient_type: input.recipientType,
      template_key: input.recipientType === 'staff' ? 'staff_email' : 'customer_email',
      payload: { subject: input.mail.subject },
      rendered_message: input.mail.subject,
      status: 'skipped',
      last_error: 'Email send in progress',
      entity: input.entity,
      entity_id: input.entityId,
      dedupe_key: input.dedupeKey,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code !== '23505') console.error('[notifications] email ledger failed:', error.message)
    return
  }
  const sent = await sendEmail({ to: input.to, ...input.mail })
  if (ledger?.id) {
    await admin
      .from('notification_outbox')
      .update(sent.ok ? { status: 'sent', last_error: null, sent_at: new Date().toISOString(), provider: 'resend' } : { status: 'failed', last_error: sent.error, provider: 'resend' })
      .eq('id', ledger.id)
  }
}

async function emailStaff(
  admin: SupabaseClient,
  input: { eventType: string; dedupeKey: string; entity: string; entityId: string; title: string; lines: string[]; path: string },
) {
  const to = await getStaffNotificationEmail(admin)
  if (!to) return
  const origin = await requestOrigin()
  await emailOnce(admin, {
    recipientType: 'staff',
    to,
    mail: staffAlertEmail({ title: input.title, lines: input.lines, url: `${origin}${input.path}` }),
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    entity: input.entity,
    entityId: input.entityId,
  })
}

/** "Product A, Product B and 3 more": at most two names, never prices or supplier data. */
export function summariseProductNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) return 'new products'
  if (clean.length <= 2) return clean.join(' and ')
  return `${clean[0]}, ${clean[1]} and ${clean.length - 2} more`
}

/**
 * Tells ONLY the given companies' active portal users that products were made visible to them:
 * in-app notification, WhatsApp outbox entry (skipped without a phone) and email. Never sent to any other
 * company. Deduped per company + product set + user, so re-saving the same visibility does not repeat it.
 */
export function notifyProductsAvailable(companyIds: string[], productIds: string[]) {
  return safely('product available', async (admin) => {
    const companies = Array.from(new Set(companyIds.filter(Boolean)))
    const products = Array.from(new Set(productIds.filter(Boolean)))
    if (companies.length === 0 || products.length === 0) return

    const { data: productRows } = await admin.from('products').select('id, name').in('id', products).eq('status', 'active')
    const names = (productRows || []).map((p) => String(p.name))
    if (names.length === 0) return
    const summary = summariseProductNames(names)
    const setKey = [...products].sort().join(',').slice(0, 200)
    const origin = await requestOrigin()

    for (const companyId of companies) {
      const { data: users } = await admin
        .from('profiles')
        .select('id, full_name, email, phone')
        .eq('company_id', companyId)
        .in('role', ['client_admin', 'client_user'])
        .eq('is_active', true)
      if (!users || users.length === 0) continue

      const inputs: EnqueueInput[] = users.map((user) => ({
        eventType: 'product_available',
        recipientType: 'customer' as const,
        recipientPhone: user.phone || null,
        recipientName: user.full_name,
        recipientProfileId: user.id,
        templateKey: 'product_available_customer' as const,
        payload: { customer_name: user.full_name || 'there', product_summary: summary },
        entity: 'companies',
        entityId: companyId,
        dedupeKey: `product_available:${companyId}:${setKey}:${user.id}`,
      }))
      // The outbox row doubles as the "already told" ledger: only newly created rows trigger the in-app
      // notification and the email, so saving the same visibility twice never repeats either.
      const created = await Promise.all(inputs.map((input) => enqueue(admin, input)))
      const fresh = created.filter((id): id is string => Boolean(id))
      if (fresh.length === 0) continue

      await admin.rpc('notify_users', {
        p_audience: 'client',
        p_company_id: companyId,
        p_title: `New in your catalogue: ${summary}`,
        p_body: null,
        p_link: '/portal/catalogue',
      })
      await dispatchNotifications(admin, fresh)
      for (let i = 0; i < users.length; i++) {
        if (!created[i] || !users[i].email) continue
        const mail = productAvailableEmail({ name: users[i].full_name || 'there', summary, url: `${origin}/portal/catalogue` })
        const sent = await sendEmail({ to: users[i].email as string, ...mail })
        if (!sent.ok) console.error('[notifications] product email failed:', sent.error)
      }
    }
  })
}

/**
 * Emails the online-store (B2C) customer about their order, once per event. Corporate (B2B) orders have
 * no storefront checkout and are handled through the portal, so they are skipped here. Uses the checkout's
 * own email address; nothing is sent when there is none or e-mail is not configured.
 */
async function emailB2cCustomer(
  admin: SupabaseClient,
  orderId: string,
  checkoutId: string | null,
  orderNumber: string,
  eventKey: string,
  title: string,
  lines: string[],
) {
  if (!checkoutId) return
  const { data: checkout } = await admin.from('storefront_checkouts').select('customer_name, customer_email').eq('id', checkoutId).maybeSingle()
  const to = String(checkout?.customer_email || '').trim()
  if (!to) return
  const origin = await requestOrigin()
  await emailOnce(admin, {
    recipientType: 'customer',
    to,
    mail: orderEmail({ name: String(checkout?.customer_name || 'there'), title, lines, trackUrl: `${origin}/track-order`, orderNumber }),
    eventType: eventKey,
    dedupeKey: `email:order:${orderId}:${eventKey}`,
    entity: 'orders',
    entityId: orderId,
  })
}

/**
 * Once a WhatsApp provider is connected, messages that were skipped ONLY because none was configured get a
 * second chance: they go back to pending (attempts reset) and are dispatched. Only recent, WhatsApp, has-a-phone
 * rows qualify (see requeue.ts), so stale or undeliverable messages are never sent. Safe to run repeatedly.
 */
export async function requeueSkippedNotifications(
  admin: SupabaseClient,
): Promise<{ requeued: number; sent: number; failed: number; skipped: number; providerReady: boolean }> {
  const providerReady = Boolean(getNotificationProvider())
  if (!providerReady) return { requeued: 0, sent: 0, failed: 0, skipped: 0, providerReady }

  const maxAgeMs = requeueMaxAgeMs(process.env.WHATSAPP_REQUEUE_MAX_AGE_DAYS)
  const since = new Date(Date.now() - maxAgeMs).toISOString()
  const { data: rows } = await admin
    .from('notification_outbox')
    .select('id, status, channel, recipient_phone, last_error, created_at')
    .eq('status', 'skipped')
    .like('last_error', `${PROVIDER_SKIP_PREFIX}%`)
    .gte('created_at', since)
    .order('created_at')
    .limit(REQUEUE_BATCH_LIMIT)

  const now = Date.now()
  const ids: string[] = []
  for (const row of rows || []) {
    const candidate = {
      status: row.status as string,
      channel: row.channel as string | null,
      recipient_phone: row.recipient_phone as string | null,
      last_error: row.last_error as string | null,
      created_at: row.created_at as string,
    }
    if (!isRequeueable(candidate, now, maxAgeMs)) continue
    // Conditional update: a row another process already moved is left alone.
    const { data: moved } = await admin
      .from('notification_outbox')
      .update({ status: 'pending', attempts: 0, last_error: null })
      .eq('id', row.id)
      .eq('status', 'skipped')
      .select('id')
      .maybeSingle()
    if (moved) ids.push(moved.id as string)
  }
  const summary = ids.length > 0 ? await dispatchNotifications(admin, ids) : { sent: 0, failed: 0, skipped: 0 }
  return { requeued: ids.length, ...summary, providerReady }
}
