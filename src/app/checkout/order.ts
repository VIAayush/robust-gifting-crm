import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOrderCreated } from '@/lib/notifications'
import { formatCustomization } from '@/lib/products/customization'
import { assignPreferredSuppliers } from '@/lib/orders/preferred-suppliers'
import { INDIVIDUAL_COMPANY_TYPE } from '@/lib/companies/individual'

type CheckoutRow = {
  id: string
  order_id: string | null
  company_id: string | null
  contact_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  delivery_address_line: string
  delivery_city: string
  delivery_state: string | null
  delivery_postal_code: string | null
  delivery_country: string
  total_amount: number
}

function todayInIndia() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * The CRM customer for a paid checkout. Created here, after payment, so an
 * abandoned or failed checkout never adds companies/contacts to the CRM.
 * A returning customer (same email) reuses their existing company and contact.
 */
async function resolveCustomer(admin: SupabaseClient, checkout: CheckoutRow): Promise<{ companyId: string; contactId: string } | { error: string }> {
  if (checkout.company_id && checkout.contact_id) {
    return { companyId: checkout.company_id, contactId: checkout.contact_id }
  }

  const email = checkout.customer_email.trim().toLowerCase()
  // limit(1), not maybeSingle(): two contacts can share an email, and
  // maybeSingle() would error on that and silently create a duplicate company.
  const { data: existingContacts } = await admin
    .from('contacts')
    .select('id, company_id')
    .ilike('email', email)
    .order('created_at')
    .limit(1)
  const existing = existingContacts?.[0]

  let companyId: string
  let contactId: string
  let createdCompanyId: string | null = null

  if (existing?.company_id) {
    companyId = existing.company_id as string
    contactId = existing.id as string
    await admin.from('contacts').update({ full_name: checkout.customer_name, phone: checkout.customer_phone }).eq('id', contactId)
  } else {
    const { data: ownerRow } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({
        name: `${checkout.customer_name} (Individual Customer)`,
        company_type: INDIVIDUAL_COMPANY_TYPE,
        status: 'active',
        owner_id: ownerRow?.id ?? null,
        city: checkout.delivery_city,
        notes: 'Individual customer, created from a paid personalized-gifts order.',
      })
      .select('id')
      .single()
    if (companyError || !company) return { error: companyError?.message || 'Could not create the customer.' }
    companyId = company.id as string
    createdCompanyId = companyId

    const { data: contact, error: contactError } = await admin
      .from('contacts')
      .insert({
        company_id: companyId,
        full_name: checkout.customer_name,
        email,
        phone: checkout.customer_phone,
        contact_type: 'primary',
        kind: 'direct',
      })
      .select('id')
      .single()
    if (contactError || !contact) {
      await admin.from('companies').delete().eq('id', companyId)
      return { error: contactError?.message || 'Could not create the customer contact.' }
    }
    contactId = contact.id as string
  }

  // Attach to the checkout only if nobody else did first.
  const { data: claimed } = await admin
    .from('storefront_checkouts')
    .update({ company_id: companyId, contact_id: contactId })
    .eq('id', checkout.id)
    .is('company_id', null)
    .select('id')
  if (!claimed || claimed.length === 0) {
    if (createdCompanyId) {
      // Lost a race: remove the duplicate we just created and use the winner's.
      await admin.from('contacts').delete().eq('company_id', createdCompanyId)
      await admin.from('companies').delete().eq('id', createdCompanyId)
    }
    const { data: fresh } = await admin.from('storefront_checkouts').select('company_id, contact_id').eq('id', checkout.id).single()
    if (fresh?.company_id && fresh.contact_id) return { companyId: fresh.company_id as string, contactId: fresh.contact_id as string }
    return { error: 'Could not attach the customer to this checkout.' }
  }
  return { companyId, contactId }
}

async function ensureLead(admin: SupabaseClient, companyId: string, contactId: string, orderNumber: string, value: number) {
  const { data: leads } = await admin.from('leads').select('id').eq('company_id', companyId).limit(1)
  if (leads && leads.length > 0) return
  const { data: company } = await admin.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
  const { error } = await admin.from('leads').insert({
    company_id: companyId,
    contact_id: contactId,
    owner_id: company?.owner_id ?? null,
    source: 'website',
    stage: 'client',
    estimated_value: value,
    notes: `Personalized-gifts customer. First paid online order ${orderNumber}.`,
  })
  if (error) console.error('[checkout] lead for paid order failed', error.message)
}

/** CRM > Invoices and Payments entries for an order that was paid online. Idempotent per order. */
async function recordOnlinePayment(
  admin: SupabaseClient,
  order: { id: string; number: string; companyId: string; amount: number },
  reference: string | null,
) {
  const { data: existing } = await admin.from('invoices').select('id').eq('order_id', order.id).limit(1)
  if (existing && existing.length > 0) {
    // The invoice survived an earlier attempt; make sure its payment entry did too.
    const { data: paid } = await admin.from('payments').select('id').eq('invoice_id', existing[0].id).limit(1)
    if (!paid || paid.length === 0) {
      const repairDate = todayInIndia()
      const { error: repairError } = await admin.from('payments').insert({
        invoice_id: existing[0].id,
        payment_date: repairDate,
        amount: order.amount,
        method: 'other',
        reference,
        notes: 'Online payment from the personalized-gifts checkout.',
      })
      if (repairError) console.error('[checkout] payment repair failed', repairError.message)
    }
    return
  }

  const { data: invoiceNumber, error: numberError } = await admin.rpc('next_invoice_number')
  if (numberError || !invoiceNumber) {
    console.error('[checkout] invoice number failed', numberError?.message)
    return
  }
  const today = todayInIndia()
  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      order_id: order.id,
      company_id: order.companyId,
      invoice_date: today,
      due_date: today,
      amount: order.amount,
      status: 'paid',
      notes: `Paid online (personalized-gifts checkout) for order ${order.number}.`,
    })
    .select('id')
    .single()
  if (invoiceError || !invoice) {
    console.error('[checkout] invoice insert failed', invoiceError?.message)
    return
  }
  const { error: paymentError } = await admin.from('payments').insert({
    invoice_id: invoice.id,
    payment_date: today,
    amount: order.amount,
    method: 'other',
    reference,
    notes: 'Online payment from the personalized-gifts checkout.',
  })
  if (paymentError) console.error('[checkout] payment insert failed', paymentError.message)
}

type CheckoutItemRow = {
  product_id: string
  variant_id: string | null
  quantity: number
  unit_price: number
  mrp_snapshot: number | null
  line_total: number
  customization: Record<string, string> | null
  product?: { name?: string } | { name?: string }[] | null
  variant?: { colour?: string; display_name?: string } | { colour?: string; display_name?: string }[] | null
}

function buildOrderItems(orderId: string, items: CheckoutItemRow[]) {
  return items.map((item) => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product
    const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
    const variantLabel = variant?.display_name || variant?.colour
    const customizationSummary = formatCustomization(item.customization, '; ')
    const descriptionParts = [product?.name || 'Product', variantLabel ? `Colour: ${variantLabel}` : '', customizationSummary].filter(Boolean)
    return {
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      description: descriptionParts.join(' — '),
      quantity: item.quantity,
      unit_price: item.unit_price,
      mrp_snapshot: item.mrp_snapshot,
      line_total: item.line_total,
      customization: item.customization,
    }
  })
}

/** An order younger than this may still be mid-creation by a concurrent caller, so it is not repaired. */
const REPAIR_AFTER_MS = 60_000

/**
 * A previous attempt created the order row but may have stopped before the items, the invoice or the
 * payment entry were written (a transient database error). Fill in whatever is missing. Safe to repeat:
 * items are only inserted when the order has none, and the invoice/payment step is idempotent.
 */
async function completeExistingOrder(
  admin: SupabaseClient,
  checkout: CheckoutRow,
  existing: { id: string; order_number: string | null; company_id: string | null; created_at: string | null },
  items: CheckoutItemRow[],
  reference: string | null,
): Promise<{ orderId: string }> {
  const age = existing.created_at ? Date.now() - new Date(existing.created_at).getTime() : Infinity
  if (age < REPAIR_AFTER_MS) return { orderId: existing.id }

  const { count } = await admin.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', existing.id)
  if (!count) {
    const { error } = await admin.from('order_items').insert(buildOrderItems(existing.id, items))
    if (error) console.error('[checkout] order items repair failed', error.message)
    else await assignPreferredSuppliers(admin, existing.id)
  }
  if (!checkout.order_id) await admin.from('storefront_checkouts').update({ order_id: existing.id, status: 'paid' }).eq('id', checkout.id)
  if (existing.company_id) {
    await recordOnlinePayment(admin, { id: existing.id, number: existing.order_number || '', companyId: existing.company_id, amount: Number(checkout.total_amount) || 0 }, reference)
  }
  return { orderId: existing.id }
}

/**
 * Creates the real orders/order_items rows from a paid checkout, so
 * fulfilment staff see it in the exact same CRM pipeline as every other
 * order. Idempotent at the DATABASE level: orders.storefront_checkout_id is
 * unique, so even two truly concurrent callers (duplicate PayU callbacks, or
 * the demo/PayU paths racing) can only ever insert one order - the loser's
 * insert hits the unique index and it returns the winner's order instead.
 */
export async function createOrderFromCheckout(
  checkoutId: string,
  payment?: { reference: string | null },
): Promise<{ orderId: string } | { error: string }> {
  const admin = createAdminClient()
  if (!admin) return { error: 'Service unavailable.' }

  const { data: checkoutData, error: checkoutError } = await admin
    .from('storefront_checkouts')
    .select('*')
    .eq('id', checkoutId)
    .single()
  if (checkoutError || !checkoutData) return { error: checkoutError?.message || 'Checkout not found.' }
  const checkout = checkoutData as CheckoutRow

  const { data: items, error: itemsError } = await admin
    .from('storefront_checkout_items')
    .select('*, product:products(name), variant:product_variants(colour, display_name)')
    .eq('checkout_id', checkoutId)
  if (itemsError) return { error: itemsError.message }
  if (!items || items.length === 0) return { error: 'Checkout has no items.' }

  // Already created (duplicate callback, or a retry after a partial failure): never create a second order,
  // but do complete anything the first attempt left unfinished.
  const { data: alreadyThere } = await admin
    .from('orders')
    .select('id, order_number, company_id, created_at')
    .eq('storefront_checkout_id', checkout.id)
    .maybeSingle()
  if (alreadyThere) return completeExistingOrder(admin, checkout, alreadyThere, items as CheckoutItemRow[], payment?.reference || null)
  if (checkout.order_id) return { orderId: checkout.order_id }

  const customer = await resolveCustomer(admin, checkout)
  if ('error' in customer) return { error: customer.error }

  const { data: orderNumber, error: orderNumberError } = await admin.rpc('next_order_number')
  if (orderNumberError || !orderNumber) return { error: orderNumberError?.message || 'Could not allocate an order number.' }

  const shippingAddress = {
    name: checkout.customer_name,
    phone: checkout.customer_phone,
    email: checkout.customer_email,
    address_line: checkout.delivery_address_line,
    city: checkout.delivery_city,
    state: checkout.delivery_state,
    postal_code: checkout.delivery_postal_code,
    country: checkout.delivery_country,
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      order_number: orderNumber,
      company_id: customer.companyId,
      contact_id: customer.contactId,
      order_value: checkout.total_amount,
      status: 'created',
      order_type: 'b2c',
      payment_status: 'paid',
      payment_reference: payment?.reference || null,
      storefront_checkout_id: checkout.id,
      shipping_address: shippingAddress,
      notes: `B2C storefront order. Delivery: ${checkout.delivery_address_line}, ${checkout.delivery_city}${checkout.delivery_state ? `, ${checkout.delivery_state}` : ''}${checkout.delivery_postal_code ? ` ${checkout.delivery_postal_code}` : ''}, ${checkout.delivery_country}.`,
    })
    .select('id')
    .single()

  if (orderError?.code === '23505') {
    // Lost a race to a concurrent caller for this same checkout - return its order.
    const { data: existing } = await admin.from('orders').select('id, order_number, company_id, created_at').eq('storefront_checkout_id', checkout.id).maybeSingle()
    if (existing) return completeExistingOrder(admin, checkout, existing, items as CheckoutItemRow[], payment?.reference || null)
  }
  if (orderError || !order) return { error: orderError?.message || 'Could not create the order.' }

  const orderItems = buildOrderItems(order.id, items as CheckoutItemRow[])

  const { error: orderItemsError } = await admin.from('order_items').insert(orderItems)
  if (orderItemsError) return { error: orderItemsError.message }

  const { error: updateError } = await admin
    .from('storefront_checkouts')
    .update({ order_id: order.id, status: 'paid' })
    .eq('id', checkoutId)
  if (updateError) return { error: updateError.message }

  // Back-office bookkeeping. None of it may undo a paid order, so failures are logged, not returned.
  const supplierResult = await assignPreferredSuppliers(admin, order.id)
  if (supplierResult.error) console.error('[checkout] supplier auto-assign failed', supplierResult.error)
  await ensureLead(admin, customer.companyId, customer.contactId, orderNumber as string, Number(checkout.total_amount) || 0)
  await recordOnlinePayment(
    admin,
    { id: order.id, number: orderNumber as string, companyId: customer.companyId, amount: Number(checkout.total_amount) || 0 },
    payment?.reference || null,
  )

  await notifyOrderCreated(order.id)
  return { orderId: order.id }
}
