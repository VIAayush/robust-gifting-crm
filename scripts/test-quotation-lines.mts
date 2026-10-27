import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { validateLine, validateHeader, canEditQuotation } from '../src/lib/quotations/line-rules.ts'

const valueOf = (r: object) => (r as { value: unknown }).value
const ok = validateLine({ quantity: '25', unit_price: '99.999', discount_percent: '5', tax_percent: '12' })
assert.ok('value' in ok)
assert.deepEqual(ok.value, { quantity: 25, unit_price: 100, discount_percent: 5, tax_percent: 12 })
assert.deepEqual(valueOf(validateLine({ quantity: 1, unit_price: 0 })), { quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 18 }, 'defaults: no discount, 18% tax')

for (const bad of [
  { quantity: 0, unit_price: 10 },
  { quantity: 1.5, unit_price: 10 },
  { quantity: 2_000_000, unit_price: 10 },
  { quantity: 'abc', unit_price: 10 },
  { quantity: 1, unit_price: -1 },
  { quantity: 1, unit_price: 'x' },
  { quantity: 1, unit_price: 10, discount_percent: 101 },
  { quantity: 1, unit_price: 10, tax_percent: -2 },
]) assert.ok('error' in validateLine(bad), JSON.stringify(bad))

const today = '2026-10-27'
assert.ok('value' in validateHeader({ tax_percent: 18, discount_percent: 0, valid_until: '2026-11-10', notes: ' terms ' }, today))
assert.equal((valueOf(validateHeader({ tax_percent: 18, discount_percent: 0, valid_until: '2026-11-10', notes: ' terms ' }, today)) as { notes: string }).notes, 'terms')
assert.equal((valueOf(validateHeader({ tax_percent: 18, discount_percent: 0, valid_until: '', notes: '' }, today)) as { valid_until: string | null }).valid_until, null)
assert.ok('error' in validateHeader({ tax_percent: 18, discount_percent: 0, valid_until: '2026-10-01', notes: '' }, today), 'past date')
assert.ok('error' in validateHeader({ tax_percent: 150, discount_percent: 0, valid_until: '', notes: '' }, today))
assert.ok('error' in validateHeader({ tax_percent: 18, discount_percent: 0, valid_until: '', notes: 'x'.repeat(2001) }, today))

assert.equal(canEditQuotation('draft'), true)
for (const status of ['sent', 'viewed', 'accepted', 'rejected', 'expired']) assert.equal(canEditQuotation(status), false, status)
console.log('quotation line rule tests: all assertions passed')
