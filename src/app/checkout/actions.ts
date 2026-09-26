'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/utils'
import type { CartItem } from '@/lib/site/cart'

function clean(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? '').trim()
}

type CustomerInput = {
  fullName: string
  email: string
  phone: string
  addressLine: string
  city: string
  state: string
  postalCode: string
}

/**
 * Creates a real checkout from the cart — this is the "real order, not just
 * a lead" entry point. Every price is re-resolved from the database here;
 * whatever price/total the browser sent along with the cart is ignored.
 */
export async function createCheckout(
  cartItems: CartItem[],
  customer: CustomerInput
): Promise<{ error?: string; checkoutId?: string }> {
  const fullName = clean(customer.fullName)
  const email = clean(customer.email).toLowerCase()
  const phone = clean(customer.phone)
  const addressLine = clean(customer.addressLine)
  const city = clean(customer.city)
  const state = clean(customer.state) || null
  const postalCode = clean(customer.postalCode) || null

  if (!fullName) return { error: 'Please share your name.' }
  if (!email || !email.includes('@')) return { error: 'Please share a valid email.' }
  if (!phone) return { error: 'Please share a phone number.' }
  if (!addressLine) return { error: 'Please share a delivery address.' }
  if (!city) return { error: 'Please share a delivery city.' }
  if (!Array.isArray(cartItems) || cartItems.length === 0) return { error: 'Your cart is empty.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Unable to start checkout just now. Please try again shortly.' }

  const productIds = Array.from(new Set(cartItems.map((item) => item.id).filter(isUuid)))
  if (productIds.length === 0) return { error: 'Your cart items could not be resolved. Please re-add them.' }

  const [{ data: products, error: productsError }, { data: variants, error: variantsError }, { data: settings }] = await Promise.all([
    admin.from('products').select('id, name, price, mrp, status, customization_enabled, customization_fields').in('id', productIds),
    admin.from('product_variants').select('id, product_id, colour, extra_price, status').in('product_id', productIds),
    admin.from('org_settings').select('delivery_charge, free_delivery_above').limit(1).maybeSingle(),
  ])
  if (productsError) return { error: productsError.message }
  if (variantsError) return { error: variantsError.message }

  const productById = new Map((products || []).map((p) => [p.id, p]))
  const variantById = new Map((variants || []).map((v) => [v.id, v]))

  const resolvedItems: {
    product_id: string
    variant_id: string | null
    quantity: number
    unit_price: number
    mrp_snapshot: number | null
    line_total: number
    customization: Record<string, string> | null
    customization_file_path: string | null
  }[] = []

  for (const item of cartItems) {
    const product = productById.get(item.id)
    if (!product || product.status !== 'active') {
      return { error: `"${item.name}" is no longer available. Please remove it from your cart and try again.` }
    }
    const quantity = Math.round(Number(item.quantity) || 0)
    if (quantity < 1 || quantity > 999) return { error: `Please choose a quantity between 1 and 999 for "${item.name}".` }
    let unitPrice = Number(product.price) || 0
    let extra = 0
    let variantId: string | null = null
    if (item.variantId) {
      const variant = variantById.get(item.variantId)
      if (!variant || variant.product_id !== item.id || (variant.status && variant.status !== 'active')) {
        return { error: `The selected colour for "${item.name}" is no longer available.` }
      }
      variantId = variant.id
      extra = Number(variant.extra_price) || 0
      unitPrice += extra
    }
    if (unitPrice <= 0) return { error: `"${item.name}" is not available for online purchase right now.` }
    const mrpSnapshot = product.mrp != null ? Number(product.mrp) + extra : null

    // Customization is only accepted for a product that has it enabled, and only
    // for the fields that product actually offers - anything else the browser
    // sends is dropped, and every value is length-capped.
    const allowedKeys = new Set<string>(product.customization_fields || [])
    const cleanedEntries =
      product.customization_enabled && item.customization && typeof item.customization === 'object'
        ? Object.entries(item.customization)
            .filter(([key, value]) => allowedKeys.has(key) && typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, String(value).trim().slice(0, 500)] as const)
        : []
    const customization = cleanedEntries.length > 0 ? Object.fromEntries(cleanedEntries) : null
    const customizationFilePath = product.customization_enabled ? item.customizationFilePath || null : null

    resolvedItems.push({
      product_id: product.id,
      variant_id: variantId,
      quantity,
      unit_price: unitPrice,
      mrp_snapshot: mrpSnapshot,
      line_total: Math.round(unitPrice * quantity * 100) / 100,
      customization,
      customization_file_path: customizationFilePath,
    })
  }

  const subtotal = Math.round(resolvedItems.reduce((sum, item) => sum + item.line_total, 0) * 100) / 100
  // Storefront prices are shown as final prices; no separate tax line is added.
  const taxAmount = 0
  const baseDelivery = Number(settings?.delivery_charge) || 0
  const freeAbove = settings?.free_delivery_above != null ? Number(settings.free_delivery_above) : null
  const deliveryCharge = freeAbove != null && subtotal >= freeAbove ? 0 : baseDelivery
  const totalAmount = Math.round((subtotal + taxAmount + deliveryCharge) * 100) / 100

  // Reuse a company by email if this customer has ordered before, instead of
  // creating a fresh "individual customer" company on every checkout. limit(1)
  // rather than maybeSingle(): two contacts can share an email, and
  // maybeSingle() would error on that and silently create a duplicate company.
  const { data: existingContacts } = await admin.from('contacts').select('id, company_id').eq('email', email).order('created_at').limit(1)
  const existingContact = existingContacts?.[0] || null

  let companyId: string
  let contactId: string

  if (existingContact) {
    companyId = existingContact.company_id
    contactId = existingContact.id
    await admin.from('contacts').update({ full_name: fullName, phone }).eq('id', contactId)
  } else {
    const { data: ownerRow } = await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({
        name: `${fullName} (Individual Customer)`,
        status: 'active',
        owner_id: ownerRow?.id ?? null,
        notes: 'Individual customer — created from a personalized-gifts checkout.',
      })
      .select('id')
      .single()
    if (companyError || !company) return { error: 'Unable to start checkout. Please try again.' }
    companyId = company.id

    const { data: contact, error: contactError } = await admin
      .from('contacts')
      .insert({ company_id: companyId, full_name: fullName, email, phone, contact_type: 'primary', kind: 'direct' })
      .select('id')
      .single()
    if (contactError || !contact) return { error: 'Unable to start checkout. Please try again.' }
    contactId = contact.id
  }

  const { data: checkout, error: checkoutError } = await admin
    .from('storefront_checkouts')
    .insert({
      status: 'awaiting_payment',
      customer_name: fullName,
      customer_email: email,
      customer_phone: phone,
      delivery_address_line: addressLine,
      delivery_city: city,
      delivery_state: state,
      delivery_postal_code: postalCode,
      subtotal,
      tax_amount: taxAmount,
      delivery_charge: deliveryCharge,
      total_amount: totalAmount,
      company_id: companyId,
      contact_id: contactId,
    })
    .select('id')
    .single()
  if (checkoutError || !checkout) return { error: 'Unable to start checkout. Please try again.' }

  const { error: itemsError } = await admin.from('storefront_checkout_items').insert(
    resolvedItems.map((item) => ({ checkout_id: checkout.id, ...item }))
  )
  if (itemsError) return { error: itemsError.message }

  return { checkoutId: checkout.id }
}
