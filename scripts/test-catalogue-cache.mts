// A database/API outage must not be cached by the public catalogue. Found 28 Oct 2026 while the Supabase data API was
// restricted (HTTP 402): the cached loaders turned a query error into [] / null and unstable_cache then kept that for its
// whole revalidate window, so the shop stayed empty (and product pages "not found") after the database recovered.
// The unstable_cache stub is switched to Next's rule here (a resolved value is cached, a thrown error is not).
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install } from './stubs/harness.mts'
;(globalThis as { __stubCache?: boolean }).__stubCache = true
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const { getPublicCatalogueProducts, getPublicProduct, getPublicProductWithVariants, getPublicCategories } = await import('../src/lib/catalogue/products.ts')

const PRODUCT = '50000000-0000-4000-8000-000000000001'
const row = {
  id: PRODUCT, name: 'ZZ Mug', sku: 'ZZ-1', description: 'd', image_url: 'https://img.example/zz.png', price: 100, mrp: null, moq: 1,
  category_id: 'cat1', brand_id: null, status: 'active', created_at: '2026-01-01', customization_enabled: false, customization_fields: null,
  category: { id: 'cat1', name: 'Mugs' }, brand: null, sales_channel: 'both', catalogue_access: 'all',
}

const db = new FakeDb()
install(db)
db.seed('categories', [{ id: 'cat1', name: 'Mugs' }])

const errors: string[] = []
const realError = console.error
console.error = (...args: unknown[]) => { errors.push(args.join(' ')) }

// 1. Outage: the shop falls back to empty for THIS request and nothing breaks.
db.readErrors.products = 'Service for this project is restricted (simulated outage)'
db.readErrors.categories = 'Service for this project is restricted (simulated outage)'
assert.deepEqual(await getPublicCatalogueProducts(), [], 'during an outage the list is empty')
assert.equal(await getPublicProduct(PRODUCT), null, 'during an outage a product is null')
assert.equal(await getPublicProductWithVariants(PRODUCT), null, 'during an outage the detail is null')
assert.deepEqual(await getPublicCategories(), [], 'during an outage the categories are empty')

// 2. Recovery: the very next request sees the data. Before the fix the empty result was cached and this failed.
delete db.readErrors.products
delete db.readErrors.categories
db.seed('products', [row])
assert.equal((await getPublicCatalogueProducts()).length, 1, 'the list recovers immediately, the outage was not cached')
assert.equal((await getPublicProduct(PRODUCT))?.name, 'ZZ Mug', 'the product recovers immediately')
assert.equal((await getPublicProductWithVariants(PRODUCT))?.name, 'ZZ Mug', 'the detail recovers immediately')
assert.equal((await getPublicCategories()).length, 1, 'the categories recover immediately')

// the outage was reported (checked after the behaviour that matters)
assert.ok(errors.some((e) => e.includes('unavailable (not cached)')), 'the outage is logged')

// 3. A genuine "not found" is still a normal cacheable answer, not an outage.
assert.equal(await getPublicProduct('50000000-0000-4000-8000-0000000000ff'), null, 'an unknown product is null')
errors.length = 0
assert.equal(await getPublicProduct('50000000-0000-4000-8000-0000000000ff'), null)
assert.equal(errors.length, 0, 'a normal miss is not reported as an outage')

console.error = realError
console.log('catalogue cache tests: all assertions passed')
