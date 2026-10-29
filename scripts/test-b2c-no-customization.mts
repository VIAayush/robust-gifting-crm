// B2C storefront must not offer or accept customisation; B2B (portal/CRM) keeps it.
// Isolated: in-memory fake database + localStorage stub, no network.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, call } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { createCheckout } from '../src/app/checkout/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { uploadCustomizationFile } from '../src/app/personalized/customization-actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { readCart, addToCart, CART_KEY } from '../src/lib/site/cart.ts'

const PID = '70000000-0000-4000-8000-000000000001'
const customer = { fullName: 'Asha Rao', email: 'asha@example.test', phone: '9876543210', addressLine: '12 MG Road, Indiranagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '560038' }
const MESSAGE = 'Personalisation is not available on individual orders. Please remove it from your cart and try again.'

function world() {
  const db = new FakeDb()
  install(db)
  db.seed('products', [{ id: PID, name: 'Mug', price: 500, mrp: 600, status: 'active', customization_enabled: true, customization_fields: ['personalized_text'] }])
  return db
}
const base = { id: PID, sku: 'MUG-1', name: 'Mug', price: 500, quantity: 1, lineId: 'l1' }
const err = (r: unknown) => (r as { error?: string }).error
const storefrontWrites = (db: InstanceType<typeof FakeDb>) => db.writes.filter((w: string) => w.startsWith('storefront_'))

// ---- createCheckout refuses customisation before any write
for (const payload of [
  { customization: { personalized_text: 'Happy Diwali' } },
  { customizationFilePath: `${PID}/1767225600000-abc123.png` },
  { customization: { personalized_text: 'x' }, customizationFilePath: `${PID}/1767225600000-abc123.png` },
]) {
  const db = world()
  const result = await call(() => createCheckout([{ ...base, ...payload }] as never, customer))
  assert.equal(err(result), MESSAGE, `rejected: ${JSON.stringify(payload)}`)
  assert.deepEqual(storefrontWrites(db), [], 'no checkout/item insert')
  assert.equal(db.rows('storefront_checkouts').length, 0)
  assert.equal(db.rows('storefront_checkout_items').length, 0)
}
// one customised line among clean ones still blocks the whole checkout
{
  const db = world()
  const result = await call(() => createCheckout([base, { ...base, lineId: 'l2', customization: { initials: 'AB' } }] as never, customer))
  assert.equal(err(result), MESSAGE)
  assert.deepEqual(storefrontWrites(db), [])
}
// empty / null customisation is not customisation: checkout succeeds and stores none, even for a customisable product
{
  const db = world()
  const result = await call(() => createCheckout([{ ...base, customization: {}, customizationFilePath: null }] as never, customer))
  assert.equal(err(result), undefined, 'clean cart accepted: ' + JSON.stringify(result))
  const items = db.rows('storefront_checkout_items') as Record<string, unknown>[]
  assert.equal(items.length, 1)
  assert.ok(!items[0].customization, 'no customization stored')
  assert.ok(!items[0].customization_file_path, 'no file path stored')
}

// ---- uploadCustomizationFile refuses and never touches storage
{
  const db = world()
  const f = new FormData()
  f.set('product_id', PID)
  f.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'a.png', { type: 'image/png' }))
  const result = (await uploadCustomizationFile(f)) as { error?: string; path?: string }
  assert.ok(result.error, 'upload refused')
  assert.equal(result.path, undefined)
  assert.deepEqual(db.writes, [], 'no database writes either')
  const src = readFileSync('src/app/personalized/customization-actions.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/storage|\.upload\(|createAdminClient/.test(src), 'action source has no storage or admin access')
}

// ---- readCart / addToCart strip customisation
{
  const store = new Map<string, string>()
  const g = globalThis as unknown as Record<string, unknown>
  g.window = { dispatchEvent: () => true }
  g.Event = class {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  store.set(
    CART_KEY,
    JSON.stringify([
      { lineId: 'a', id: PID, sku: 'MUG-1', name: 'Mug', price: 500, quantity: 2, customization: { personalized_text: 'Hi' }, customizationFilePath: `${PID}/1-abc123.png` },
      { lineId: 'b', id: PID, sku: 'MUG-2', name: 'Mug', price: 500, variantId: 'v-blue', quantity: 1, customization: { initials: 'AB' }, customizationFilePath: null },
    ])
  )
  const cart = readCart() as Record<string, unknown>[]
  assert.equal(cart.length, 2, 'lines are kept')
  for (const line of cart) {
    assert.ok(!('customization' in line) && !('customizationFilePath' in line), 'customisation dropped on read')
  }
  assert.deepEqual(cart.map((l) => l.quantity), [2, 1])
  // adding with customisation supplied: ignored, and merges into the matching line
  addToCart({ id: PID, sku: 'MUG-1', name: 'Mug', price: 500, customization: { personalized_text: 'x' }, customizationFilePath: 'p' } as never, 1)
  const after = JSON.parse(store.get(CART_KEY)!) as Record<string, unknown>[]
  assert.equal(after.length, 2, 'matching product+variant merges')
  assert.equal(after[0].quantity, 3)
  assert.ok(after.every((l) => !('customization' in l) && !('customizationFilePath' in l)), 'nothing customised persisted')
  // a different variant is a separate line
  addToCart({ id: PID, sku: 'MUG-1', name: 'Mug', price: 500, variantId: 'v-red' } as never, 1)
  assert.equal((JSON.parse(store.get(CART_KEY)!) as unknown[]).length, 3)
}

// ---- source-level guards
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const sourceFiles = [...walk('src/app/personalized'), 'src/components/site/personalized-purchase-actions.tsx']
for (const f of sourceFiles.filter((p) => /\.(tsx?|mts)$/.test(p))) {
  assert.ok(!/ProductCustomizer|product-customizer/.test(readFileSync(f, 'utf8')), `${f} must not use ProductCustomizer`)
}
for (const f of [
  'src/components/site/personalized-purchase-actions.tsx',
  'src/components/site/add-to-cart-control.tsx',
  'src/components/site/cart-page-content.tsx',
  'src/app/checkout/[id]/review/page.tsx',
  'src/app/personalized/product/[id]/page.tsx',
]) {
  assert.ok(!/formatCustomization|validateCustomization|customizationFields|customizationEnabled/.test(readFileSync(f, 'utf8')), `${f} has no customisation UI/validation`)
}
assert.equal(existsSync('src/components/site/product-customizer.tsx'), false, 'customiser component removed')

// ---- B2B keeps customisation
assert.match(readFileSync('src/app/portal/shortlist/actions.ts', 'utf8'), /customization_notes/, 'portal shortlist still accepts customisation notes')
assert.ok(existsSync('src/components/products/product-customization-editor.tsx'), 'CRM product customisation editor still present')

console.log('b2c no-customization tests: all assertions passed')
