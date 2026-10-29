// READ-ONLY check of the catalogue picker queries against the live database (service role, SELECT only).
// Run: node --env-file=.env --import ./scripts/register-alias.mjs scripts/db-tests/04-catalogue-picker.mjs
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { getCandidatePriceBounds, findCatalogueCandidateIds, searchCatalogueCandidates } from '../../src/lib/catalogues/candidates.ts'

const SUPPLIER = '7419eeae-67f7-42e8-82c9-d9641b2ddaf1' // HGS
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Run with --env-file=.env (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
const supabase = createClient(url, key, { auth: { persistSession: false } })

let passed = 0
const check = (cond, msg) => { assert.ok(cond, msg); passed++; console.log(`  ok  ${msg}`) }

async function all(table, select, apply) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(supabase.from(table).select(select)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// Independent truth: products joined through product_suppliers (not via the library's helpers).
const maps = await all('product_suppliers', 'product_id', (q) => q.eq('supplier_id', SUPPLIER).eq('status', 'active'))
const supplied = [...new Set(maps.map((m) => m.product_id))]
const active = []
for (let i = 0; i < supplied.length; i += 200) {
  const { data, error } = await supabase.from('products').select('id, price, status').in('id', supplied.slice(i, i + 200))
  if (error) throw new Error(error.message)
  active.push(...data.filter((p) => p.status === 'active'))
}
const priced = active.filter((p) => Number(p.price) > 0)
console.log(`HGS: ${supplied.length} mapped products, ${active.length} active, ${priced.length} with price > 0`)
check(supplied.length > 0, 'HGS has mapped products')

const prices = priced.map((p) => Number(p.price))
const trueMin = Math.min(...prices)
const trueMax = Math.max(...prices)
const filter = { mode: 'supplier', supplierId: SUPPLIER }

const bounds = await getCandidatePriceBounds(supabase, filter)
console.log(`  bounds from library: ${JSON.stringify(bounds)}; true min/max: ${trueMin} / ${trueMax}`)
check(bounds && bounds.min === trueMin && bounds.max === trueMax, 'getCandidatePriceBounds min/max equal the true min/max of priced HGS products')

const withPriceFilter = await getCandidatePriceBounds(supabase, { ...filter, minPrice: String(trueMax), maxPrice: String(trueMax) })
check(withPriceFilter && withPriceFilter.min === trueMin && withPriceFilter.max === trueMax, 'bounds ignore the price filter itself')

// Price-filtered count vs an independent count (a mid-range window that matches some but not all).
const sorted = [...prices].sort((a, b) => a - b)
const lo = sorted[Math.floor(sorted.length * 0.25)]
const hi = sorted[Math.floor(sorted.length * 0.75)]
const expected = active.filter((p) => Number(p.price) >= lo && Number(p.price) <= hi)
const filtered = { ...filter, minPrice: String(lo), maxPrice: String(hi) }
const page = await searchCatalogueCandidates(supabase, filtered, 1, 50)
console.log(`  window ${lo}..${hi}: library total ${page.total}, independent ${expected.length}`)
check(!page.error && page.total === expected.length, 'price-filtered total equals the independent count')
check(expected.length > 0 && expected.length < active.length, 'the test window is a real subset')

const reversed = await searchCatalogueCandidates(supabase, { ...filter, minPrice: String(hi), maxPrice: String(lo) }, 1, 50)
check(!reversed.error && reversed.total === expected.length, 'a reversed (tampered) min/max gives the same result as the swapped range')
const junk = await searchCatalogueCandidates(supabase, { ...filter, minPrice: '-3', maxPrice: 'abc' }, 1, 50)
check(!junk.error && junk.total === active.length, 'junk min/max is ignored without an error')

// Select-all-matching ids == filtered ids (priced only), nothing inactive or outside the filter.
const ids = await findCatalogueCandidateIds(supabase, filtered, 2001, { pricedOnly: true })
const expectedIds = expected.filter((p) => Number(p.price) > 0).map((p) => p.id).sort()
check(JSON.stringify([...ids].sort()) === JSON.stringify(expectedIds), `select-all-matching ids (${ids.length}) equal the independent filtered priced ids`)
check(new Set(ids).size === ids.length, 'no duplicate ids')
const allIds = await findCatalogueCandidateIds(supabase, filter, 2001, { pricedOnly: true })
check(allIds.length === priced.length, 'unfiltered select-all returns exactly the priced active HGS products')

// Search mode bounds (order + limit(1)) vs a full read of active priced products.
const everything = await all('products', 'price', (q) => q.eq('status', 'active').gt('price', 0))
const sb = await getCandidatePriceBounds(supabase, { mode: 'search' })
const ev = everything.map((p) => Number(p.price))
check(sb && sb.min === Math.min(...ev) && sb.max === Math.max(...ev), `search-mode bounds equal the true min/max of ${ev.length} active priced products`)

console.log(`\n${passed} checks passed (read-only, no rows written)`)
