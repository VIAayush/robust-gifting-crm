import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { planRollback } from '../src/lib/pricing/rollback.ts'

const rows = [
  { product_id: 'a', old_price: 100, new_price: 120, old_mrp: 150, new_mrp: 160 },
  { product_id: 'b', old_price: 50, new_price: 60, old_mrp: null, new_mrp: 80 },
  { product_id: 'c', old_price: 10, new_price: 12, old_mrp: null, new_mrp: null },
  { product_id: 'gone', old_price: 1, new_price: 2, old_mrp: null, new_mrp: null },
  { product_id: 'a', old_price: 999, new_price: 999, old_mrp: null, new_mrp: null },
]
const current = new Map([
  ['a', { price: 120, mrp: 160 }],
  ['b', { price: 65, mrp: 80 }], // edited again after the batch
  ['c', { price: 12, mrp: null }],
])
const plan = planRollback(rows, current)
assert.deepEqual(plan.revert.map((r: { product_id: string }) => r.product_id), ['a', 'c'])
assert.equal(plan.revert[0].price, 100)
assert.equal(plan.revert[0].mrp, 150)
assert.equal(plan.revert[1].mrp, null, 'a MRP that was empty before is restored to empty')
assert.deepEqual(plan.conflicts, ['b'], 'newer edit is never overwritten')
assert.deepEqual(plan.missing, ['gone'])

// numeric strings from the database compare equal to numbers
const strPlan = planRollback([rows[0]], new Map([['a', { price: '120.00' as unknown as number, mrp: '160' as unknown as number }]]))
assert.equal(strPlan.revert.length, 1)
console.log('price rollback planning tests: all assertions passed')
