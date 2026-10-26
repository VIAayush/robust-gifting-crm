import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { isValidTrackingLookup, normalizeOrderNumber } from '../src/lib/orders/tracking-lookup.ts'

assert.equal(normalizeOrderNumber(' ord 123 '), 'ORD123')
assert.deepEqual(isValidTrackingLookup('ord-1001', ' A@B.com '), { orderNumber: 'ORD-1001', email: 'a@b.com' })
assert.equal(isValidTrackingLookup('', 'a@b.com'), null)
assert.equal(isValidTrackingLookup('AB', 'a@b.com'), null)
assert.equal(isValidTrackingLookup("ORD1'; drop", 'a@b.com'), null)
assert.equal(isValidTrackingLookup('ORD-1', 'not-an-email'), null)
assert.equal(isValidTrackingLookup('ORD-1', 'a@b.com'.padEnd(300, 'x')), null)
console.log('tracking lookup tests: all assertions passed')
