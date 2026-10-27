import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Marks a checkout failed ONLY when nothing for it has been paid or ordered. A checkout can have several payment
 * attempts; one failed attempt must never overwrite a checkout that another attempt already paid for.
 */
export async function markCheckoutFailedIfUnpaid(admin: SupabaseClient, checkoutId: string): Promise<boolean> {
  const { data: checkout } = await admin.from('storefront_checkouts').select('id, order_id').eq('id', checkoutId).maybeSingle()
  if (!checkout || checkout.order_id) return false
  const { data: paid } = await admin.from('storefront_payments').select('id').eq('checkout_id', checkoutId).eq('status', 'paid').limit(1)
  if (paid && paid.length > 0) return false
  await admin.from('storefront_checkouts').update({ status: 'failed' }).eq('id', checkoutId).is('order_id', null)
  return true
}
