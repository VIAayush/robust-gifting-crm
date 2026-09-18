import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Picks a product's new legacy/primary image (products.image_url) after its
 * current primary photo changes or is removed: the lowest-sort_order photo
 * that isn't tied to a specific colour becomes primary, or null if none remain.
 * Shared by the legacy single-image editor and the multi-photo gallery manager
 * so the two never disagree about which photo is "the" product photo.
 */
export async function resyncPrimaryImage(supabase: SupabaseClient, productId: string) {
  const { data: remaining } = await supabase
    .from('product_images')
    .select('id, image_url')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .limit(1)
  const next = remaining?.[0] || null
  await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  if (next) {
    await supabase.from('product_images').update({ is_primary: true }).eq('id', next.id)
  }
  await supabase.from('products').update({ image_url: next?.image_url ?? null }).eq('id', productId)
}
