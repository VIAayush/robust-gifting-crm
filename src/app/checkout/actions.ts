'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isClientPortalUser } from '@/lib/auth/client-guard'
import { b2bOnlyProductIds } from '@/lib/catalogue/channel'
import { isValidCustomizationPath } from '@/lib/site/upload-rules'
import { validateCustomization } from '@/lib/products/customization'
import { isUuid } from '@/lib/utils'
import type { CartItem } from '@/lib/site/cart'
import { RATE_LIMIT_MESSAGE } from '@/lib/security/rate-limit'
import { RATE_RULES, isRateLimited } from '@/lib/security/rate-limit-server'
import { deliveryChargeFor } from '@/lib/checkout/delivery'
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

  if (await isRateLimited(RATE_RULES.order)) return { error: RATE_LIMIT_MESSAGE }

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

  const [{ data: products, error: productsError }, { data: variants, error: variantsError }, { data: settings, error: settingsError }] = await Promise.all([
    admin.from('products').select('id, name, price, mrp, status, customization_enabled, customization_fields').in('id', productIds),
    admin.from('product_variants').select('id, product_id, colour, extra_price, status').in('product_id', productIds),
    admin.from('org_settings').select('delivery_charge, free_delivery_above').limit(1).maybeSingle(),
  ])
  if (productsError) return { error: productsError.message }
  // The delivery charge is part of what the customer pays: never fall back to "free" because settings could not be read.
  if (settingsError) return { error: 'Unable to start checkout just now. Please try again shortly.' }
  if (variantsError) return { error: variantsError.message }

  const b2bOnly = await b2bOnlyProductIds(admin, productIds)
  if (b2bOnly.size > 0) return { error: 'Some items in your cart are available to corporate customers only. Please remove them or request a quote.' }

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
    // Only a path our own upload action could have produced for THIS product is accepted; anything else is dropped.
    const customizationFilePath = product.customization_enabled && isValidCustomizationPath(item.customizationFilePath, item.id) ? item.customizationFilePath! : null
    let customization: Record<string, string> | null = null
    if (product.customization_enabled) {
      // Required fields, lengths and formats are enforced here, whatever the browser did.
      const checked = validateCustomization(product.customization_fields || [], item.customization as Record<string, unknown> | null, Boolean(customizationFilePath))
      if (!checked.ok) return { error: `Personalisation for "${item.name}": ${checked.error}` }
      customization = Object.keys(checked.cleaned).length > 0 ? checked.cleaned : null
    }

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
  const deliveryCharge = deliveryChargeFor(subtotal, settings)
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
