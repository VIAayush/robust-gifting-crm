import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { validatePayment, canRecordPayment } from '../src/lib/finance/payment-rules.ts'

const invoice = { amount: 1000, alreadyPaid: 400 }
const today = '2026-10-27'
const good = { amount: '600', method: 'upi', payment_date: '2026-10-20', reference: ' UTR1 ', notes: '' }
const result = validatePayment(good, invoice, today) as { value: { amount: number; reference: string | null } }
assert.equal(result.value.amount, 600)
assert.equal(result.value.reference, 'UTR1')

const bad = (patch: object, inv = invoice) => assert.ok('error' in validatePayment({ ...good, ...patch }, inv, today), JSON.stringify(patch))
bad({ amount: '0' })
bad({ amount: '-5' })
bad({ amount: 'abc' })
bad({ amount: 'NaN' })
bad({ amount: '601' }) // more than outstanding
bad({ amount: '1e12' })
bad({ method: 'bitcoin' })
bad({ payment_date: '2026-10-28' }) // future
bad({ payment_date: 'yesterday' })
bad({ reference: 'x'.repeat(121) })
bad({ notes: 'x'.repeat(1001) })
bad({ amount: '1' }, { amount: 500, alreadyPaid: 500 }) // already paid

assert.ok(!('error' in validatePayment({ ...good, amount: '600' }, invoice, today)), 'exact outstanding is allowed')
assert.equal(canRecordPayment('admin'), true)
assert.equal(canRecordPayment('accounts'), true)
for (const role of ['sales', 'operations', 'management', 'client_admin', 'client_user', null, undefined]) assert.equal(canRecordPayment(role as string), false, String(role))
console.log('payment rule tests: all assertions passed')

// invoicing an order
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const rules = await import('../src/lib/finance/payment-rules.ts')
assert.deepEqual(rules.canInvoiceOrder({ status: 'delivered', order_value: 5000 }, false), { ok: true })
assert.equal(rules.canInvoiceOrder({ status: 'delivered', order_value: 5000 }, true).ok, false, 'one invoice per order')
assert.equal(rules.canInvoiceOrder({ status: 'cancelled', order_value: 5000 }, false).ok, false)
assert.equal(rules.canInvoiceOrder({ status: 'delivered', order_value: 0 }, false).ok, false)
assert.equal(rules.canInvoiceOrder({ status: 'delivered', order_value: null }, false).ok, false)
assert.deepEqual(rules.invoiceDueDate('', '2026-10-27'), { ok: true, due: '2026-11-26' }, 'default 30 days')
assert.deepEqual(rules.invoiceDueDate('2026-12-01', '2026-10-27'), { ok: true, due: '2026-12-01' })
assert.equal(rules.invoiceDueDate('2026-10-01', '2026-10-27').ok, false, 'due before invoice date')
assert.equal(rules.invoiceDueDate('soon', '2026-10-27').ok, false)
console.log('invoice rule tests: all assertions passed')
