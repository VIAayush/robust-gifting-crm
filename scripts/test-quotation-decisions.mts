import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { acceptedTotals, validateDecisions, overallOutcome } from '../src/lib/quotations/decisions.ts'

const items = [
  { id: 'a', quantity: 10, unitPrice: 100 },
  { id: 'b', quantity: 5, unitPrice: 200 },
  { id: 'c', quantity: 1, unitPrice: 0.1 },
]

// all accepted = same as the full quotation total (subtotal 2000.10, 10% discount, 18% tax)
const all = acceptedTotals(items, new Set(['a', 'b', 'c']), 10, 18)
assert.equal(all.subtotal, 2000.1)
assert.equal(all.discount, 200.01)
assert.equal(all.tax, 324.02)
assert.equal(all.total, 2124.11)

// partial acceptance recomputes discount and tax on the accepted lines only
const partial = acceptedTotals(items, new Set(['b']), 10, 18)
assert.equal(partial.subtotal, 1000)
assert.equal(partial.discount, 100)
assert.equal(partial.tax, 162)
assert.equal(partial.total, 1062)

assert.equal(acceptedTotals(items, new Set(), 10, 18).total, 0, 'nothing accepted = zero')
assert.equal(acceptedTotals(items, new Set(['zzz']), 0, 0).total, 0, 'unknown ids are ignored')

const ids = ['a', 'b', 'c']
const d = (itemId: string, accept: boolean) => ({ itemId, accept })
assert.deepEqual(validateDecisions(ids, [d('a', true), d('b', false), d('c', true)]), { ok: true })
assert.equal(validateDecisions(ids, [d('a', true), d('b', false)]).ok, false, 'every item must be decided')
assert.equal(validateDecisions(ids, [d('a', true), d('a', false), d('c', true)]).ok, false, 'no duplicates')
assert.equal(validateDecisions(ids, [d('a', true), d('b', true), d('x', true)]).ok, false, 'foreign item rejected')
assert.equal(validateDecisions([], []).ok, false)
assert.equal(validateDecisions(ids, [d('a', true), d('b', true), { itemId: 'c', accept: 'yes' as unknown as boolean }]).ok, false, 'accept must be boolean')

assert.equal(overallOutcome([d('a', true), d('b', true)]), 'accepted')
assert.equal(overallOutcome([d('a', true), d('b', false)]), 'partial')
assert.equal(overallOutcome([d('a', false)]), 'rejected')
console.log('quotation decision tests: all assertions passed')
