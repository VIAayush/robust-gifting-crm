import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { validatePayable, applyPayablePayment } from '../src/lib/finance/payable-rules.ts'

const ok = { vendor_type: 'supplier', vendor_name: '  Alpha   Traders ', amount: '1500.505', due_date: '2026-11-30', notes: '' }
const v = validatePayable(ok) as { value: { vendor_name: string; amount: number; due_date: string | null; notes: string | null } }
assert.equal(v.value.vendor_name, 'Alpha Traders')
assert.equal(v.value.amount, 1500.51)
assert.equal(v.value.notes, null)

for (const patch of [{ vendor_type: 'bank' }, { vendor_name: ' ' }, { vendor_name: 'x'.repeat(121) }, { amount: '0' }, { amount: '-1' }, { amount: 'abc' }, { amount: '1e12' }, { due_date: 'soon' }, { notes: 'x'.repeat(1001) }]) {
  assert.ok('error' in validatePayable({ ...ok, ...patch }), JSON.stringify(patch))
}

const payable = { amount: 1000, amount_paid: 250 }
assert.deepEqual(applyPayablePayment(payable, '250'), { amountPaid: 500, status: 'partial' })
assert.deepEqual(applyPayablePayment(payable, 750), { amountPaid: 1000, status: 'paid' })
assert.ok('error' in applyPayablePayment(payable, 750.01), 'overpayment refused')
assert.ok('error' in applyPayablePayment(payable, 0))
assert.ok('error' in applyPayablePayment(payable, 'x'))
assert.ok('error' in applyPayablePayment({ amount: 100, amount_paid: 100 }, 1), 'already paid')
assert.deepEqual(applyPayablePayment({ amount: 0.3, amount_paid: 0.1 }, 0.2), { amountPaid: 0.3, status: 'paid' }, 'no floating point drift')
console.log('payable rule tests: all assertions passed')
