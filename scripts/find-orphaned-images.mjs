/**
 * READ-ONLY. Lists every object in the product-images bucket that is not
 * referenced by any products.image_url or product_images.storage_path/
 * image_url row, and writes the result to scripts/_verified_orphans.json
 * (plain path strings) for review before any deletion.
 */
import fs from 'fs'
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

const BUCKET = 'product-images'
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

async function listAllObjects() {
  const results = []
  const folders = ['']
  while (folders.length > 0) {
    const prefix = folders.pop()
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
      if (error) throw new Error(`list(${prefix}) failed: ${error.message}`)
      if (!data || data.length === 0) break
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id === null) folders.push(full) // folder (no id) vs file
        else results.push({ name: full, size: entry.metadata?.size ?? 0 })
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  return results
}

async function main() {
  const [{ data: products }, { data: productImages }, allObjects] = await Promise.all([
    admin.from('products').select('image_url'),
    admin.from('product_images').select('storage_path, image_url'),
    listAllObjects(),
  ])

  const referenced = new Set()
  for (const p of products || []) {
    const path = extractPath(p.image_url)
    if (path) referenced.add(path)
  }
  for (const pi of productImages || []) {
    if (pi.storage_path) referenced.add(pi.storage_path)
    const path = extractPath(pi.image_url)
    if (path) referenced.add(path)
  }

  const orphans = allObjects.filter((o) => !referenced.has(o.name))
  const totalBytes = orphans.reduce((s, o) => s + (o.size || 0), 0)

  fs.writeFileSync('scripts/_verified_orphans.json', JSON.stringify(orphans.map((o) => o.name), null, 2))
  console.log('TOTAL_OBJECTS=' + allObjects.length)
  console.log('REFERENCED=' + referenced.size)
  console.log('ORPHANS=' + orphans.length)
  console.log('ORPHAN_BYTES=' + totalBytes)
  console.log('ORPHAN_MB=' + (totalBytes / 1024 / 1024).toFixed(1))
  console.log('Manifest written to scripts/_verified_orphans.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
