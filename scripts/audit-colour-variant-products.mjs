/**
 * READ-ONLY audit. Reports groups of existing `products` rows that look like
 * the same physical item imported once per colour (the "RG-NO-02 / RG-NO-02 /
 * RG-NO-02" problem) so a human can review before anything is merged.
 *
 * Makes zero writes. Nothing here changes the database, storage or any
 * historical order/quotation record.
 *
 * Run with: node --env-file=.env scripts/audit-colour-variant-products.mjs
 */
import { createClient } from '@supabase/supabase-js'

// Mirrors src/lib/products/colours.ts (kept in sync manually — this script
// runs standalone, outside the Next.js/TS build).
const KNOWN_COLOURS = [
  'Royal Blue', 'Sky Blue', 'Bottle Green', 'Off White', 'Wine', 'Burgundy',
  'Turquoise', 'Teal', 'Cream', 'Grey', 'Gray', 'Yellow', 'Orange', 'Pink',
  'Violet', 'Purple', 'Mint', 'Olive', 'Green', 'Brown', 'Tan', 'Beige',
  'Maroon', 'Red', 'Navy', 'Blue', 'White', 'Black',
]

function stripColourSuffixFromName(name) {
  const trimmed = name.trim()
  for (const colour of KNOWN_COLOURS) {
    const pattern = new RegExp(`[\\s,\\-]+${colour}$`, 'i')
    if (pattern.test(trimmed)) {
      return { base: trimmed.replace(pattern, '').trim(), colour }
    }
  }
  return null
}

function stripColourSuffixFromSku(sku) {
  const normalized = sku.trim().toUpperCase()
  for (const colour of KNOWN_COLOURS) {
    const suffix = colour.toUpperCase().replace(/\s+/g, '[ _-]?')
    const pattern = new RegExp(`[ _-]${suffix}$`, 'i')
    const match = normalized.match(pattern)
    if (match) {
      const base = normalized.slice(0, match.index).trim()
      if (base) return { base, colour }
    }
  }
  return null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, price, category_id, status')
    .neq('status', 'discontinued')
    .order('name')
  if (error) {
    console.error('Failed to read products:', error.message)
    process.exit(1)
  }

  // Candidate key: category_id + colour-stripped base name (preferred signal),
  // falling back to a colour-stripped base SKU when the name doesn't carry a
  // recognizable colour word. Two rows only group if they agree on category.
  const groups = new Map()
  for (const p of products) {
    const byName = stripColourSuffixFromName(p.name)
    const bySku = stripColourSuffixFromSku(p.sku)
    if (!byName && !bySku) continue
    const baseName = byName ? byName.base.toLowerCase() : null
    const baseSku = bySku ? bySku.base : null
    const key = `${p.category_id || 'none'}::${baseName || baseSku}`
    const list = groups.get(key) || []
    list.push({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      colour: (byName || bySku)?.colour,
      matchedBy: byName ? 'name' : 'sku',
    })
    groups.set(key, list)
  }

  const realGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1)

  console.log(`Scanned ${products.length} non-discontinued products.`)
  console.log(`Found ${realGroups.length} candidate colour-duplicate group(s).\n`)

  for (const [key, rows] of realGroups) {
    console.log(`— ${key}`)
    for (const row of rows) {
      console.log(`    ${row.sku.padEnd(20)} ${row.colour.padEnd(12)} ₹${row.price}\t${row.name}\t(matched by ${row.matchedBy}) [${row.id}]`)
    }
    console.log('')
  }

  if (realGroups.length === 0) {
    console.log('No candidate groups found. Nothing to review.')
  } else {
    console.log(
      'Nothing above has been changed. Review each group, then ask for the ones that are genuinely\n' +
        'the same product before any merge is applied — over-merging (e.g. different sizes or\n' +
        'unrelated products that happen to share a colour word) is exactly what this is meant to catch.',
    )
  }
}

main()
