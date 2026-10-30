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

// decisionSummary: the accepted-only figure shown beside the quoted total
{
  // @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
  const { decisionSummary } = await import('../src/lib/quotations/decisions.ts')
  const items = [
    { id: 'a', quantity: 60, unit_price: 100, client_decision: 'accepted' },
    { id: 'b', quantity: 60, unit_price: 70, client_decision: 'rejected' },
    { id: 'c', quantity: 60, unit_price: 155, client_decision: 'accepted' },
  ]
  assert.deepEqual(decisionSummary(items, 0, 18), { acceptedCount: 2, itemCount: 3, acceptedTotal: 18054 })
  assert.equal(decisionSummary(items.map((i) => ({ ...i, client_decision: 'accepted' })), 0, 18), null, 'nothing rejected: no summary')
  assert.equal(decisionSummary(items.map((i) => ({ ...i, client_decision: null })), 0, 18), null, 'undecided: no summary')
  assert.deepEqual(decisionSummary(items.map((i) => ({ ...i, client_decision: 'rejected' })), '0', '18'), { acceptedCount: 0, itemCount: 3, acceptedTotal: 0 })
  assert.equal(decisionSummary(items, 10, 18)?.acceptedTotal, 16248.6, 'discount then tax, string-safe')
  console.log('decision summary tests: all assertions passed')
}
