import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { parseRecentlyViewed, pushRecentlyViewed, RECENTLY_VIEWED_LIMIT } from '../src/lib/site/recently-viewed.ts'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = (n: number) => ({ id: uuid(n), sku: `S${n}`, name: `Product ${n}`, price: n, image_url: null, category_name: null })

let list: ReturnType<typeof pushRecentlyViewed> = []
for (let i = 1; i <= 15; i++) list = pushRecentlyViewed(list, item(i))
assert.equal(list.length, RECENTLY_VIEWED_LIMIT)
assert.equal(list[0].id, uuid(15), 'newest first')

list = pushRecentlyViewed(list, item(12))
assert.equal(list[0].id, uuid(12), 're-viewing moves it to the front')
assert.equal(list.filter((x: { id: string }) => x.id === uuid(12)).length, 1, 'no duplicates')

const parsed = parseRecentlyViewed([item(1), { id: 'not-a-uuid', name: 'x' }, null, 'str', { id: uuid(2), name: '' }, item(1), { ...item(3), price: 'abc' }])
assert.deepEqual(parsed.map((x: { id: string }) => x.id), [uuid(1), uuid(3)])
assert.equal(parsed[1].price, null, 'non-numeric price is dropped')
assert.deepEqual(parseRecentlyViewed('garbage'), [])
console.log('recently viewed tests: all assertions passed')
