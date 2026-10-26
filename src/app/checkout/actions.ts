'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isClientPortalUser } from '@/lib/auth/client-guard'
import { isUuid } from '@/lib/utils'
import type { CartItem } from '@/lib/site/cart'
import { validateCheckoutCustomer, type CheckoutCustomer, type CheckoutFieldErrors } from '@/lib/checkout/validation'

/**
 * Creates a real checkout from the cart — this is the "real order, not just
 * a lead" entry point. Every price is re-resolved from the database here;
 * whatever price/total the browser sent along with the cart is ignored.
 */
export async function createCheckout(
  cartItems: CartItem[],
  customer: CheckoutCustomer
): Promise<{ error?: string; fieldErrors?: CheckoutFieldErrors; checkoutId?: string }> {
  // Corporate (B2B) client users order through requirements and quotations, never B2C checkout.
  if (await isClientPortalUser()) {
    return { error: 'Corporate accounts request products through the client portal. Please use Requirements instead of checkout.' }
  }

  // Never trust the browser's validation: re-check every field here.
  const { errors, value } = validateCheckoutCustomer(customer)
  if (Object.keys(errors).length > 0) return { error: 'Please fix the highlighted fields.', fieldErrors: errors }
  const { fullName, email, phone, addressLine, city } = value
  const state = value.state || null
  const postalCode = value.postalCode

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

  // No CRM company/contact is created here: that happens only once payment
  // succeeds (createOrderFromCheckout), so abandoned checkouts leave no trace
  // in the CRM. The customer details live on the checkout until then.
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
