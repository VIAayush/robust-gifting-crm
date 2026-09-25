'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { canonicalColourName } from '@/lib/products/colours'
import { resyncPrimaryImage } from '@/lib/products/gallery'

const CATALOGUE_ROLES = ['admin', 'sales'] as const
type CatalogueRole = (typeof CATALOGUE_ROLES)[number]

const IMAGE_BUCKET = 'product-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function publicImageUrl(objectPath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return objectPath
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${IMAGE_BUCKET}/${objectPath.replace(/^\/+/, '')}`
}

async function requireCatalogueAccess() {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' as const }
  if (!CATALOGUE_ROLES.includes(profile.role as CatalogueRole)) {
    return { error: 'Not permitted to manage this product' as const }
  }
  return { profile }
}

function revalidateProduct(productId: string) {
  revalidatePath(`/crm/products/${productId}`)
  revalidatePath('/crm/products')
  revalidatePath('/portal/catalogue')
  revalidatePath('/catalogue')
}

export async function addProductVariant(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const productId = String(formData.get('product_id') || '')
  const colourRaw = String(formData.get('colour') || '').trim()
  if (!productId || !colourRaw) return { error: 'Colour is required' }
  const colour = canonicalColourName(colourRaw)
  const displayName = String(formData.get('display_name') || '').trim() || colour
  const extraPriceRaw = String(formData.get('extra_price') || '').trim()
  const extraPrice = extraPriceRaw ? Number(extraPriceRaw) : 0
  if (extraPriceRaw && !Number.isFinite(extraPrice)) return { error: 'Price difference must be a number' }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('product_variants')
    .select('sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1

  const { data: variant, error } = await supabase
    .from('product_variants')
    .insert({ product_id: productId, colour, display_name: displayName, extra_price: extraPrice, sort_order: nextSort })
    .select('id')
    .single()
  if (error || !variant) return { error: error?.message || 'Could not add colour' }

  revalidateProduct(productId)
  return { success: true, variantId: variant.id }
}

export async function renameProductVariant(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const variantId = String(formData.get('variant_id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!variantId || !productId) return { error: 'Unable to update this colour. Please try again.' }

  const displayName = String(formData.get('display_name') || '').trim()
  const extraPriceRaw = String(formData.get('extra_price') || '').trim()
  const update: Record<string, unknown> = {}
  if (displayName) update.display_name = displayName
  if (extraPriceRaw) {
    const extraPrice = Number(extraPriceRaw)
    if (!Number.isFinite(extraPrice)) return { error: 'Price difference must be a number' }
    update.extra_price = extraPrice
  }
  if (Object.keys(update).length === 0) return { error: 'Nothing to update' }

  const supabase = await createClient()
  const { error } = await supabase.from('product_variants').update(update).eq('id', variantId)
  if (error) return { error: error.message }

  revalidateProduct(productId)
  return { success: true }
}

export async function removeProductVariant(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const variantId = String(formData.get('variant_id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!variantId || !productId) return { error: 'Unable to remove this colour. Please try again.' }

  const supabase = await createClient()
  const { data: images } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('variant_id', variantId)
  const paths = (images || []).map((i) => i.storage_path).filter((p): p is string => Boolean(p))
  if (paths.length > 0) await supabase.storage.from(IMAGE_BUCKET).remove(paths)

  // Deleting the variant cascades its product_images rows in the database.
  const { error } = await supabase.from('product_variants').delete().eq('id', variantId)
  if (error) return { error: error.message }

  await resyncPrimaryImage(supabase, productId)
  revalidateProduct(productId)
  return { success: true }
}

export async function addVariantImages(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '').trim() || null
  if (!productId) return { error: 'Unable to upload photos. Please try again.' }

  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { error: 'Choose at least one photo to upload.' }
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES[file.type]) return { error: 'Please upload only JPG, PNG or WebP images.' }
    if (file.size > MAX_IMAGE_BYTES) return { error: 'Each image must be smaller than 5 MB.' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('product_images')
    .select('id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const hadAnyImages = Boolean(existing?.length)
  let nextSort = (existing?.[0]?.sort_order ?? -1) + 1

  let uploaded = 0
  for (const file of files) {
    const extension = ALLOWED_IMAGE_TYPES[file.type]
    const objectPath = `${productId}/${variantId || 'shared'}/${Date.now()}-${nextSort}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
    if (uploadError) continue
    const isPrimary = !hadAnyImages && uploaded === 0
    await supabase.from('product_images').insert({
      product_id: productId,
      variant_id: variantId,
      image_url: publicImageUrl(objectPath),
      storage_path: objectPath,
      sort_order: nextSort,
      is_primary: isPrimary,
    })
    if (isPrimary) await supabase.from('products').update({ image_url: publicImageUrl(objectPath) }).eq('id', productId)
    nextSort += 1
    uploaded += 1
  }

  if (uploaded === 0) return { error: 'Photos could not be uploaded. Please try again.' }
  revalidateProduct(productId)
  return { success: true, uploaded }
}

export async function removeProductPhoto(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const imageId = String(formData.get('image_id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!imageId || !productId) return { error: 'Unable to remove this photo. Please try again.' }

  const supabase = await createClient()
  const { data: image } = await supabase
    .from('product_images')
    .select('id, storage_path, is_primary')
    .eq('id', imageId)
    .maybeSingle()
  if (!image) return { error: 'Photo not found' }

  const { error } = await supabase.from('product_images').delete().eq('id', imageId)
  if (error) return { error: error.message }
  if (image.storage_path) await supabase.storage.from(IMAGE_BUCKET).remove([image.storage_path])

  if (image.is_primary) await resyncPrimaryImage(supabase, productId)
  revalidateProduct(productId)
  return { success: true }
}

export async function setPrimaryProductPhoto(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const imageId = String(formData.get('image_id') || '')
  const productId = String(formData.get('product_id') || '')
  if (!imageId || !productId) return { error: 'Unable to update this photo. Please try again.' }

  const supabase = await createClient()
  const { data: image } = await supabase.from('product_images').select('id, image_url').eq('id', imageId).maybeSingle()
  if (!image) return { error: 'Photo not found' }

  await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  const { error } = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId)
  if (error) return { error: error.message }
  await supabase.from('products').update({ image_url: image.image_url }).eq('id', productId)

  revalidateProduct(productId)
  return { success: true }
}

export async function moveProductPhoto(formData: FormData) {
  const auth = await requireCatalogueAccess()
  if ('error' in auth) return auth

  const imageId = String(formData.get('image_id') || '')
  const productId = String(formData.get('product_id') || '')
  const direction = String(formData.get('direction') || '')
  if (!imageId || !productId || (direction !== 'up' && direction !== 'down')) {
    return { error: 'Unable to reorder photos. Please try again.' }
  }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('product_images')
    .select('id, sort_order, variant_id')
    .eq('id', imageId)
    .maybeSingle()
  if (!current) return { error: 'Photo not found' }

  // Reordering only makes sense within the same gallery (product-wide, or one colour's own photos).
  let neighborQuery = supabase
    .from('product_images')
    .select('id, sort_order')
    .eq('product_id', productId)
  neighborQuery = current.variant_id
    ? neighborQuery.eq('variant_id', current.variant_id)
    : neighborQuery.is('variant_id', null)
  neighborQuery = direction === 'up'
    ? neighborQuery.lt('sort_order', current.sort_order).order('sort_order', { ascending: false })
    : neighborQuery.gt('sort_order', current.sort_order).order('sort_order', { ascending: true })
  const { data: neighbor } = await neighborQuery.limit(1).maybeSingle()
  if (!neighbor) return { success: true }

  await supabase.from('product_images').update({ sort_order: neighbor.sort_order }).eq('id', current.id)
  await supabase.from('product_images').update({ sort_order: current.sort_order }).eq('id', neighbor.id)

  revalidateProduct(productId)
  return { success: true }
}
