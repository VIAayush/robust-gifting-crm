// Server-action tests (finance): called directly, with an in-memory fake database. Proves the application-layer
// authorisation and validation only. Row-level security and constraints are NOT exercised here (BLOCKED until a database exists).
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { recordPayment, createInvoiceFromOrder } from '../src/app/crm/invoices/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { createPayable, recordPayablePayment } from '../src/app/crm/payables/actions.ts'

const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const INVOICE = '20000000-0000-4000-8000-000000000001'
const ORDER = '30000000-0000-4000-8000-000000000001'
const PAYABLE = '40000000-0000-4000-8000-000000000001'

function world() {
  const db = new FakeDb()
  install(db)
  const roles = {
    admin: profile(db, 'admin'),
    accounts: profile(db, 'accounts'),
    sales: profile(db, 'sales'),
    operations: profile(db, 'operations'),
    management: profile(db, 'management'),
    client: profile(db, 'client_user', { company_id: 'c1' }),
  }
  db.seed('invoices', [{ id: INVOICE, amount: 1000 }])
  db.seed('payments', [{ invoice_id: INVOICE, amount: 400 }])
  db.seed('orders', [{ id: ORDER, order_number: 'ORD-1', company_id: 'c1', status: 'delivered', order_value: 5000 }])
  db.seed('payables', [{ id: PAYABLE, vendor_name: 'Alpha', amount: 1000, amount_paid: 250, status: 'partial' }])
  db.rpcHandlers.next_invoice_number = () => ({ data: 'INV-0001' })
  return { db, roles }
}

const pay = (over: Record<string, string> = {}) => form({ invoice_id: INVOICE, amount: '300', method: 'upi', payment_date: today, ...over })

// ---- recordPayment: who may call it
for (const role of ['sales', 'operations', 'management', 'client'] as const) {
  const { db, roles } = world()
  signIn(db, roles[role])
  const result = await call(() => recordPayment(pay()))
  assert.ok(isError(result), `${role} must be refused`)
  assert.equal(db.writes.filter((w: string) => w === 'payments:insert').length, 0, `${role}: nothing may be written`)
}
{
  const { db } = world()
  signIn(db, null)
  assert.ok(isError(await call(() => recordPayment(pay()))), 'anonymous is refused')
  assert.equal(db.writes.length, 0)
}
for (const role of ['admin', 'accounts'] as const) {
  const { db, roles } = world()
  signIn(db, roles[role])
  const result = await call(() => recordPayment(pay()))
  assert.ok(isSuccess(result), `${role} may record a payment: ${JSON.stringify(result)}`)
  assert.equal(db.rows('payments').length, 2)
  assert.ok(db.rpcCalls.some((c: { name: string }) => c.name === 'refresh_invoice_status'))
  assert.ok(db.writes.includes('audit_logs:insert'), 'payment recording is audited')
}
// validation: overpayment, zero, negative, future date, unknown method, malformed invoice id
for (const [label, over] of [
  ['overpayment', { amount: '600.01' }],
  ['zero', { amount: '0' }],
  ['negative', { amount: '-5' }],
  ['not a number', { amount: 'abc' }],
  ['future date', { payment_date: '2999-01-01' }],
  ['bad method', { method: 'bitcoin' }],
  ['bad invoice id', { invoice_id: "x'; drop table" }],
] as const) {
  const { db, roles } = world()
  signIn(db, roles.accounts)
  const result = await call(() => recordPayment(pay(over)))
  assert.ok(isError(result), `${label} must be refused`)
  assert.equal(db.rows('payments').length, 1, `${label}: no payment row added`)
}
{
  // exactly the outstanding amount is accepted
  const { db, roles } = world()
  signIn(db, roles.accounts)
  assert.ok(isSuccess(await call(() => recordPayment(pay({ amount: '600' })))))
}

// ---- createInvoiceFromOrder
for (const role of ['sales', 'operations', 'management', 'client'] as const) {
  const { db, roles } = world()
  signIn(db, roles[role])
  assert.ok(isError(await call(() => createInvoiceFromOrder(ORDER))), `${role} cannot create invoices`)
  assert.equal(db.rows('invoices').length, 1)
}
{
  const { db, roles } = world()
  signIn(db, roles.accounts)
  const first = await call(() => createInvoiceFromOrder(ORDER))
  assert.ok(isSuccess(first), JSON.stringify(first))
  const invoice = (db.rows('invoices').find((i) => i.order_id === ORDER) as unknown as { amount: number; status: string; invoice_number: string })
  assert.equal(invoice.amount, 5000, 'the amount comes from the order, not the browser')
  assert.equal(invoice.status, 'unpaid')
  assert.equal(invoice.invoice_number, 'INV-0001')
  const second = await call(() => createInvoiceFromOrder(ORDER))
  assert.ok(isError(second), 'a second invoice for the same order is refused')
  assert.equal(db.rows('invoices').filter((i) => i.order_id === ORDER).length, 1)
}
{
  const { db, roles } = world()
  db.rows('orders')[0].status = 'cancelled'
  signIn(db, roles.accounts)
  assert.ok(isError(await call(() => createInvoiceFromOrder(ORDER))), 'a cancelled order cannot be invoiced')
  assert.ok(isError(await call(() => createInvoiceFromOrder('not-a-uuid'))))
  assert.ok(isError(await call(() => createInvoiceFromOrder(ORDER, '2000-01-01'))), 'due date before the invoice date')
}

// ---- payables
for (const role of ['sales', 'operations', 'management', 'client'] as const) {
  const { db, roles } = world()
  signIn(db, roles[role])
  assert.ok(isError(await call(() => createPayable(form({ vendor_type: 'supplier', vendor_name: 'X', amount: '10' })))), `${role} cannot create payables`)
  assert.ok(isError(await call(() => recordPayablePayment(form({ id: PAYABLE, payment: '10' })))), `${role} cannot pay payables`)
  assert.equal(db.rows('payables')[0].amount_paid, 250)
}
{
  const { db, roles } = world()
  signIn(db, roles.accounts)
  assert.ok(isSuccess(await call(() => createPayable(form({ vendor_type: 'courier', vendor_name: 'Fast Couriers', amount: '500' })))))
  assert.equal(db.rows('payables').length, 2)
  assert.ok(isError(await call(() => createPayable(form({ vendor_type: 'courier', vendor_name: 'Fast', amount: '500', order_number: 'NOPE' })))), 'unknown order number is an error, not ignored')
  assert.ok(isSuccess(await call(() => recordPayablePayment(form({ id: PAYABLE, payment: '750' })))))
  const row = (db.rows('payables').find((p) => p.id === PAYABLE) as unknown as { amount_paid: number; status: string })
  assert.deepEqual([row.amount_paid, row.status], [1000, 'paid'], "status uses the database value 'paid'")
  assert.ok(isError(await call(() => recordPayablePayment(form({ id: PAYABLE, payment: '1' })))), 'already fully paid')
}
{
  const { db, roles } = world()
  signIn(db, roles.accounts)
  assert.ok(isSuccess(await call(() => recordPayablePayment(form({ id: PAYABLE, payment: '100' })))))
  const row = (db.rows('payables').find((p) => p.id === PAYABLE) as unknown as { amount_paid: number; status: string })
  assert.deepEqual([row.amount_paid, row.status], [350, 'partial'], "partial payment status is 'partial' (a valid database value)")
}
console.log('finance action tests: all assertions passed')
