/**
 * Re-encode ACTIVE product images that are larger than necessary (max 1600px,
 * WebP q78) to cut Supabase Storage egress. Staged and safe:
 *   1. download original -> 2. re-encode -> 3. upload as a new object
 *   4. verify the new object is servable -> 5. update DB rows to point at it
 *   6. verify no DB rows still reference the old path -> 7. delete the old object
 * Skips images already WebP, already <=1600px, and already <=350KB.
 * Writes a full manifest to scripts/_optimize-manifest.json for audit/rollback.
 *
 * Usage: node scripts/optimize-active-product-images.mjs [--limit=N] [--apply]
 * Without --apply, does everything except delete the old object (dry-run on step 7 only).
 */
import fs from 'fs'
import sharp from 'sharp'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv('.env')

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity

const BUCKET = 'product-images'
const MAX_DIM = 1600
const QUALITY = 78
const SKIP_UNDER_BYTES = 350 * 1024

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function extractPath(url) {
  if (!url) return null
  const marker = `/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

function buildUrl(path) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`
}

async function main() {
  const { data: products } = await admin.from('products').select('id, image_url').eq('status', 'active')
  const { data: productImages } = await admin
    .from('product_images')
    .select('id, product_id, storage_path, image_url, products!inner(status)')
    .eq('products.status', 'active')

  // path -> { productsRows: [...], productImagesRows: [...] }
  const pathRefs = new Map()
  for (const p of products || []) {
    const path = extractPath(p.image_url)
    if (!path) continue
    if (!pathRefs.has(path)) pathRefs.set(path, { products: [], productImages: [] })
    pathRefs.get(path).products.push(p.id)
  }
  for (const pi of productImages || []) {
    const path = pi.storage_path || extractPath(pi.image_url)
    if (!path) continue
    if (!pathRefs.has(path)) pathRefs.set(path, { products: [], productImages: [] })
    pathRefs.get(path).productImages.push(pi.id)
  }

  const allPaths = [...pathRefs.keys()].slice(0, LIMIT)
  console.log(`Processing ${allPaths.length} distinct active image paths (apply=${APPLY})`)

  const manifest = []
  const hashSeen = new Map() // content hash -> first path (duplicate detection, report only)
  let skipped = 0
  let migrated = 0
  let failed = 0

  for (const [i, path] of allPaths.entries()) {
    try {
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
      if (dlErr || !blob) throw new Error('download failed: ' + (dlErr?.message || 'no data'))
      const buf = Buffer.from(await blob.arrayBuffer())
      const hash = crypto.createHash('sha256').update(buf).digest('hex')
      if (hashSeen.has(hash) && hashSeen.get(hash) !== path) {
        manifest.push({ path, status: 'duplicate_content', duplicateOf: hashSeen.get(hash) })
      } else {
        hashSeen.set(hash, path)
      }

      const meta = await sharp(buf).metadata()
      const alreadyGood =
        meta.format === 'webp' && (meta.width || 0) <= MAX_DIM && (meta.height || 0) <= MAX_DIM && buf.length <= SKIP_UNDER_BYTES
      if (alreadyGood) {
        skipped += 1
        manifest.push({ path, status: 'skipped_already_optimal', origSizeKB: +(buf.length / 1024).toFixed(1) })
        if ((i + 1) % 25 === 0) console.log(`[${i + 1}/${allPaths.length}] ...`)
        continue
      }

      const outBuf = await sharp(buf)
        .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer()

      // No net size/quality win (already-small or already-efficient source) - keep the original.
      if (outBuf.length >= buf.length) {
        skipped += 1
        manifest.push({
          path,
          status: 'skipped_no_improvement',
          origSizeKB: +(buf.length / 1024).toFixed(1),
          candidateSizeKB: +(outBuf.length / 1024).toFixed(1),
        })
        continue
      }

      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      const base = path.split('/').pop().replace(/\.[a-zA-Z0-9]+$/, '')
      const newPath = `${dir ? dir + '/' : ''}${base}-opt-${Date.now()}.webp`

      if (!APPLY) {
        manifest.push({
          path,
          status: 'dry_run_would_migrate',
          origSizeKB: +(buf.length / 1024).toFixed(1),
          newSizeKB: +(outBuf.length / 1024).toFixed(1),
          newPath,
          refs: pathRefs.get(path),
        })
        migrated += 1
        continue
      }

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(newPath, outBuf, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
      if (upErr) throw new Error('upload failed: ' + upErr.message)

      // Verify the new object is actually servable before touching the DB.
      const { data: verifyBlob, error: verifyErr } = await admin.storage.from(BUCKET).download(newPath)
      if (verifyErr || !verifyBlob || verifyBlob.size === 0) throw new Error('verify failed after upload')

      const newUrl = buildUrl(newPath)
      const refs = pathRefs.get(path)
      for (const productId of refs.products) {
        const { error } = await admin.from('products').update({ image_url: newUrl }).eq('id', productId)
        if (error) throw new Error('DB update (products) failed: ' + error.message)
      }
      for (const piId of refs.productImages) {
        const { error } = await admin
          .from('product_images')
          .update({ image_url: newUrl, storage_path: newPath })
          .eq('id', piId)
        if (error) throw new Error('DB update (product_images) failed: ' + error.message)
      }

      // Confirm no row still references the old path before it's safe to delete later.
      const { count: stillProducts } = await admin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('image_url', buildUrl(path))
      const { count: stillImages } = await admin
        .from('product_images')
        .select('id', { count: 'exact', head: true })
        .eq('storage_path', path)

      migrated += 1
      manifest.push({
        path,
        status: 'migrated',
        origSizeKB: +(buf.length / 1024).toFixed(1),
        newSizeKB: +(outBuf.length / 1024).toFixed(1),
        newPath,
        productsUpdated: refs.products.length,
        productImagesUpdated: refs.productImages.length,
        oldPathStillReferenced: (stillProducts || 0) + (stillImages || 0) > 0,
        safeToDeleteOld: (stillProducts || 0) + (stillImages || 0) === 0,
      })

      if ((i + 1) % 10 === 0) console.log(`[${i + 1}/${allPaths.length}] migrated=${migrated} skipped=${skipped} failed=${failed}`)
    } catch (e) {
      failed += 1
      manifest.push({ path, status: 'failed', error: String(e.message || e) })
      console.error(`FAILED ${path}:`, e.message || e)
    }
  }

  fs.writeFileSync('scripts/_optimize-manifest.json', JSON.stringify(manifest, null, 2))
  const origTotal = manifest.reduce((s, m) => s + (m.origSizeKB || 0), 0)
  const newTotal = manifest.filter((m) => m.status === 'migrated' || m.status === 'dry_run_would_migrate').reduce((s, m) => s + (m.newSizeKB || 0), 0)
  const migratedOrigTotal = manifest
    .filter((m) => m.status === 'migrated' || m.status === 'dry_run_would_migrate')
    .reduce((s, m) => s + (m.origSizeKB || 0), 0)

  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify({ total: allPaths.length, migrated, skipped, failed, apply: APPLY }, null, 2))
  console.log(`Migrated set: ${migratedOrigTotal.toFixed(1)} KB -> ${newTotal.toFixed(1)} KB`)
  console.log('Manifest written to scripts/_optimize-manifest.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
