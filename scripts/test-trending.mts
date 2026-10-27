import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { rankByActivity, mergeTrending } from '../src/lib/catalogue/trending.ts'

// order lines count double, interests single, ties broken by id
const ranked = rankByActivity(['a', 'a', 'b'], ['b', 'c', 'c', 'c'], 10)
// a=4, c=3, b=3 (tie c/b broken by id -> b before c)
assert.deepEqual(ranked, ['a', 'b', 'c'])
assert.deepEqual(rankByActivity([], [], 5), [], 'no activity = no trending')
assert.deepEqual(rankByActivity(['x', 'y', 'z'], [], 2).length, 2, 'limit respected')
assert.deepEqual(rankByActivity(['', 'a'], [''], 5), ['a'], 'blank ids ignored')

const catalogue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const fallback = [{ id: 'd' }, { id: 'a' }, { id: 'c' }]
const real = mergeTrending(['b', 'ghost', 'a'], catalogue, fallback, 4)
assert.deepEqual(real.products.map((p: { id: string }) => p.id), ['b', 'a', 'd', 'c'], 'activity first, unknown ids dropped, fallback fills without repeats')
assert.equal(real.isReal, true)
const none = mergeTrending([], catalogue, fallback, 2)
assert.deepEqual(none.products.map((p: { id: string }) => p.id), ['d', 'a'])
assert.equal(none.isReal, false, 'heading must not claim trending without activity')
assert.equal(mergeTrending(['ghost'], catalogue, fallback, 3).isReal, false, 'activity for products not in the catalogue does not count')
console.log('trending tests: all assertions passed')
