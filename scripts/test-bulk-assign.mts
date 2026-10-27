import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { planBulkAssignment, rowsFromSkuList } from '../src/lib/suppliers/bulk-assign.ts'

const row = (over: Record<string, string | number> = {}) => ({ row: 2, sku: 'A1', supplier: 'Alpha', supplier_cost: '', supplier_sku: '', lead_time_days: '', moq: '', preferred: '', ...over })
const mapping = (over: object = {}) => ({ id: 'm1', product_id: 'p1', supplier_id: 's1', supplier_cost: 100, supplier_sku: 'X', lead_time_days: 5, moq: 10, is_preferred: false, status: 'active', ...over })
const ctx = () => ({
  productBySku: new Map([['A1', 'p1'], ['B2', 'p2']]),
  supplierByName: new Map([['alpha', 's1'], ['beta', 's2']]),
  mappingsByProduct: new Map([['p1', [mapping()]]]),
})
const add = { mode: 'add' as const, createMissingSuppliers: false }

// create vs update vs unchanged
let plan = planBulkAssignment([row({ sku: 'B2', supplier: 'Alpha', supplier_cost: '55.5' })], ctx(), add)
assert.equal(plan.rows[0].status, 'create')
assert.equal(plan.rows[0].cost, 55.5)
plan = planBulkAssignment([row({ supplier_cost: '120' })], ctx(), add)
assert.equal(plan.rows[0].status, 'update')
assert.equal(plan.rows[0].costChanged, true)
assert.equal(plan.rows[0].oldCost, 100)
plan = planBulkAssignment([row({})], ctx(), add)
assert.equal(plan.rows[0].status, 'unchanged', 'blank cells leave an existing mapping as is')
assert.equal(plan.rows[0].cost, 100)

// errors
const errorOf = (r: Record<string, string>, options = add) => {
  const p = planBulkAssignment([row(r)], ctx(), options)
  assert.equal(p.rows[0].status, 'error', JSON.stringify(r))
  return (p.rows[0] as { error: string }).error
}
assert.match(errorOf({ sku: 'NOPE' }), /SKU not found/)
assert.match(errorOf({ sku: '' }), /Missing SKU/)
assert.match(errorOf({ supplier: '' }), /Missing supplier/)
assert.match(errorOf({ supplier: 'Gamma' }), /does not exist/)
assert.match(errorOf({ supplier_cost: '-5' }), /cost/)
assert.match(errorOf({ supplier_cost: 'abc' }), /cost/)
assert.match(errorOf({ lead_time_days: '2.5' }), /Lead time/)
assert.match(errorOf({ moq: 'x' }), /MOQ/)

// duplicates and a single preferred supplier per product
plan = planBulkAssignment([row({ row: 2 }), row({ row: 3 })], ctx(), add)
assert.equal(plan.rows[1].status, 'error')
plan = planBulkAssignment([row({ row: 2, preferred: 'yes' }), row({ row: 3, supplier: 'Beta', preferred: 'yes' })], ctx(), add)
assert.equal(plan.rows[0].status === 'error', false)
assert.equal(plan.rows[1].status, 'error')

// create missing suppliers is opt-in and de-duplicated
plan = planBulkAssignment([row({ supplier: 'Gamma' }), row({ row: 3, sku: 'B2', supplier: 'gamma' })], ctx(), { mode: 'add', createMissingSuppliers: true })
assert.deepEqual(plan.suppliersToCreate, ['Gamma'])
assert.equal(plan.counts.create, 2)
assert.equal(plan.rows[0].status === 'create' && plan.rows[0].createSupplier, true)

// replace mode switches off other active mappings, but only for products with a valid row
const replaceCtx = ctx()
replaceCtx.mappingsByProduct.set('p1', [mapping(), mapping({ id: 'm2', supplier_id: 's2' })])
plan = planBulkAssignment([row({ supplier: 'Alpha' })], replaceCtx, { mode: 'replace', createMissingSuppliers: false })
assert.deepEqual(plan.deactivate.map((d: { mappingId: string }) => d.mappingId), ['m2'])
plan = planBulkAssignment([row({ supplier: 'Gamma' })], replaceCtx, { mode: 'replace', createMissingSuppliers: false })
assert.equal(plan.deactivate.length, 0, 'a failed row never removes current suppliers')
plan = planBulkAssignment([row({ supplier: 'Alpha' })], replaceCtx, add)
assert.equal(plan.deactivate.length, 0, 'add mode never deactivates')

// inactive mapping is reactivated by an update
const inactiveCtx = ctx()
inactiveCtx.mappingsByProduct.set('p1', [mapping({ status: 'inactive' })])
assert.equal(planBulkAssignment([row({})], inactiveCtx, add).rows[0].status, 'update')

// SKU list helper
const list = rowsFromSkuList('A1, B2\nC3', 'Alpha', '10', true)
assert.equal(list.length, 3)
assert.equal(list[0].preferred, 'yes')
console.log('bulk supplier assignment planner tests: all assertions passed')
