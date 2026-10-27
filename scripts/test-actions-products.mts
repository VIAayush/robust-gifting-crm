// Product edits: cost and margin are written only by roles allowed to see them; SKU only by an admin; protected rules hold.
// Isolated fake database: column privileges (migration 37) are NOT exercised here (BLOCKED until a database exists).
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { updateProduct } from '../src/app/crm/products/actions.ts'

const PRODUCT = 'b0000000-0000-4000-8000-000000000001'

function world() {
  const db = new FakeDb()
  install(db)
  const ids = {
    admin: profile(db, 'admin'),
    sales: profile(db, 'sales'),
    accounts: profile(db, 'accounts'),
    operations: profile(db, 'operations'),
    client: profile(db, 'client_admin', { company_id: 'c1' }),
  }
  db.seed('products', [{ id: PRODUCT, sku: 'HGS-100', name: 'Mug', price: 100, mrp: 150, category_id: 'cat1', supplier_cost: 40, internal_margin: 20, moq: 1, status: 'active' }])
  return { db, ids }
}
const product = (db: InstanceType<typeof FakeDb>) => db.rows('products')[0] as Record<string, unknown>
const edit = (over: Record<string, string> = {}) => form({ name: 'Mug', price: '100', mrp: '150', moq: '1', ...over })

for (const role of ['operations', 'accounts', 'client'] as const) {
  const { db, ids } = world()
  signIn(db, ids[role])
  assert.ok(isError(await call(() => updateProduct(PRODUCT, edit({ name: 'Hacked' })))), `${role} cannot edit products`)
  assert.equal(product(db).name, 'Mug')
}
{
  // sales may edit the product but a hand-built request cannot change cost or margin
  const { db, ids } = world()
  signIn(db, ids.sales)
  assert.ok(isSuccess(await call(() => updateProduct(PRODUCT, edit({ name: 'Mug 2', supplier_cost: '1', internal_margin: '99' })))))
  assert.equal(product(db).name, 'Mug 2')
  assert.equal(product(db).supplier_cost, 40, 'sales cannot rewrite the supplier cost')
  assert.equal(product(db).internal_margin, 20, 'sales cannot rewrite the margin')
  // and a normal sales edit (no cost field in the form) leaves the cost alone
  assert.ok(isSuccess(await call(() => updateProduct(PRODUCT, edit({ price: '120' })))))
  assert.equal(product(db).supplier_cost, 40)
}
{
  const { db, ids } = world()
  signIn(db, ids.admin)
  assert.ok(isSuccess(await call(() => updateProduct(PRODUCT, edit({ supplier_cost: '55', internal_margin: '25' })))))
  assert.equal(product(db).supplier_cost, 55, 'an admin may change the cost')
  assert.equal(product(db).internal_margin, 25)
  assert.ok(isError(await call(() => updateProduct(PRODUCT, edit({ supplier_cost: '-3' })))), 'negative cost refused')
  assert.equal(product(db).supplier_cost, 55)
}
{
  // SKU: only admin; MRP never below price; the existing SKU is otherwise untouched
  const { db, ids } = world()
  signIn(db, ids.sales)
  assert.ok(isError(await call(() => updateProduct(PRODUCT, edit({ sku: 'NEW-1' })))), 'sales cannot change a SKU')
  assert.equal(product(db).sku, 'HGS-100')
  assert.ok(isError(await call(() => updateProduct(PRODUCT, edit({ price: '200', mrp: '150' })))), 'MRP below price refused')
  signIn(db, ids.admin)
  assert.ok(isSuccess(await call(() => updateProduct(PRODUCT, edit({ sku: 'HGS-100' })))), 'resaving the same SKU is a no-op')
  assert.equal(product(db).sku, 'HGS-100')
}
console.log('product action tests: all assertions passed')
