import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Creates the real orders/order_items rows from a paid checkout, so
 * fulfilment staff see it in the exact same CRM pipeline as every other
 * order. Idempotent: if storefront_checkouts.order_id is already set (a
 * duplicate PayU callback, or the demo/PayU paths racing), it returns the
 * existing order instead of creating a second one.
 */
export async function createOrderFromCheckout(checkoutId: string): Promise<{ orderId: string } | { error: string }> {
  const admin = createAdminClient()
  if (!admin) return { error: 'Service unavailable.' }

  const { data: checkout, error: checkoutError } = await admin
    .from('storefront_checkouts')
    .select('*')
    .eq('id', checkoutId)
    .single()
  if (checkoutError || !checkout) return { error: checkoutError?.message || 'Checkout not found.' }

  if (checkout.order_id) return { orderId: checkout.order_id }

  const { data: items, error: itemsError } = await admin
    .from('storefront_checkout_items')
    .select('*, product:products(name), variant:product_variants(colour, display_name)')
    .eq('checkout_id', checkoutId)
  if (itemsError) return { error: itemsError.message }
  if (!items || items.length === 0) return { error: 'Checkout has no items.' }

  const { data: orderNumber, error: orderNumberError } = await admin.rpc('next_order_number')
  if (orderNumberError || !orderNumber) return { error: orderNumberError?.message || 'Could not allocate an order number.' }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      order_number: orderNumber,
      company_id: checkout.company_id,
      contact_id: checkout.contact_id,
      order_value: checkout.total_amount,
      status: 'created',
      notes: `B2C storefront order. Delivery: ${checkout.delivery_address_line}, ${checkout.delivery_city}${checkout.delivery_state ? `, ${checkout.delivery_state}` : ''}${checkout.delivery_postal_code ? ` ${checkout.delivery_postal_code}` : ''}, ${checkout.delivery_country}.`,
    })
    .select('id')
    .single()
  if (orderError || !order) return { error: orderError?.message || 'Could not create the order.' }

  const orderItems = items.map((item) => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product
    const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
    const variantLabel = variant?.display_name || variant?.colour
    const customizationSummary =
      item.customization && typeof item.customization === 'object'
        ? Object.entries(item.customization as Record<string, string>)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}: ${value}`)
            .join('; ')
        : ''
    const descriptionParts = [product?.name || 'Product', variantLabel ? `Colour: ${variantLabel}` : '', customizationSummary].filter(Boolean)
    return {
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      description: descriptionParts.join(' — '),
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      customization: item.customization,
    }
  })

  const { error: orderItemsError } = await admin.from('order_items').insert(orderItems)
  if (orderItemsError) return { error: orderItemsError.message }

  const { error: updateError } = await admin
    .from('storefront_checkouts')
    .update({ order_id: order.id, status: 'paid' })
    .eq('id', checkoutId)
  if (updateError) return { error: updateError.message }

  return { orderId: order.id }
}
