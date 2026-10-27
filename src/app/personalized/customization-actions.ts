'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sniffFileType } from '@/lib/site/upload-rules'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BUCKET = 'order-customizations'
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Uploads a customization logo/artwork file at add-to-cart time (before any
 * checkout/order exists yet), server-side via the admin client — same
 * reasoning as every other anonymous public-form write in this app: there
 * is no Supabase Auth session for a guest shopper to authorize a storage
 * write against. Returns a storage path only (not a public URL — the
 * bucket is private; staff view it from the CRM order via a signed URL).
 */
export async function uploadCustomizationFile(formData: FormData): Promise<{ error?: string; path?: string }> {
  const productId = String(formData.get('product_id') || '')
  const file = formData.get('file')
  if (!UUID_RE.test(productId)) return { error: 'Missing product.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a file.' }
  if (file.size > MAX_BYTES) return { error: 'File is too large (max 5MB).' }
  const extension = ALLOWED_TYPES[file.type]
  if (!extension) return { error: 'Please upload a PNG, JPEG, WEBP or PDF file.' }

  // The file's real type comes from its content, not from the type the browser claims.
  const sniffed = sniffFileType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  if (!sniffed || sniffed !== extension) return { error: 'That file does not look like a valid PNG, JPEG, WEBP or PDF.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Unable to upload right now. Please try again shortly.' }

  // Only accept uploads for a real, active personalisable product.
  const { data: product } = await admin.from('products').select('id, status, customization_enabled').eq('id', productId).maybeSingle()
  if (!product || product.status !== 'active' || !product.customization_enabled) return { error: 'This product cannot be personalised.' }

  const objectPath = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (error) return { error: 'Unable to upload the file. Please try again.' }

  return { path: objectPath }
}
