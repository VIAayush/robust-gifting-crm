import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { normaliseSalesChannel, visibleInMode, filterProductsForMode, b2bOnlyProductIds } from '../src/lib/catalogue/channel.ts'

assert.equal(normaliseSalesChannel(undefined), 'both', 'missing column = both')
assert.equal(normaliseSalesChannel(null), 'both')
assert.equal(normaliseSalesChannel('garbage'), 'both')
assert.equal(normaliseSalesChannel('b2b'), 'b2b')
assert.equal(normaliseSalesChannel('b2c'), 'b2c')

assert.equal(visibleInMode('both', 'corporate'), true)
assert.equal(visibleInMode('both', 'personalized'), true)
assert.equal(visibleInMode('b2b', 'corporate'), true)
assert.equal(visibleInMode('b2b', 'personalized'), false, 'B2B-only never appears in the B2C store')
assert.equal(visibleInMode('b2c', 'personalized'), true)
assert.equal(visibleInMode('b2c', 'corporate'), false, 'B2C-only never appears in the B2B catalogue')

const products = [
  { id: 'a', salesChannel: 'both' as const },
  { id: 'b', salesChannel: 'b2b' as const },
  { id: 'c', salesChannel: 'b2c' as const },
]
assert.deepEqual(filterProductsForMode(products, 'corporate').map((p: { id: string }) => p.id), ['a', 'b'])
assert.deepEqual(filterProductsForMode(products, 'personalized').map((p: { id: string }) => p.id), ['a', 'c'])

// Server guard against B2B-only items in the cart, using a stub client (no database).
const stub = (rows: unknown[] | null, error: unknown = null) => ({
  from: () => ({ select: () => ({ in: async () => ({ data: rows, error }) }) }),
})
const blocked = await b2bOnlyProductIds(stub([{ id: 'a', sales_channel: 'both' }, { id: 'b', sales_channel: 'b2b' }]) as never, ['a', 'b'])
assert.deepEqual([...blocked], ['b'])
const noColumn = await b2bOnlyProductIds(stub(null, { code: '42703' }) as never, ['a', 'b'])
assert.equal(noColumn.size, 0, 'missing column blocks nothing')
assert.equal((await b2bOnlyProductIds(stub([]) as never, [])).size, 0)
console.log('sales channel tests: all assertions passed')
