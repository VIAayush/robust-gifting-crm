import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { summarizeReceivables, invoiceBalance, paidByInvoice, businessToday } from '../src/lib/finance/receivables.ts'

const today = '2026-10-30'
const invoices = [
  { id: 'a', amount: 8879.5, due_date: '2026-11-30' }, // partly paid
  { id: 'b', amount: 3776, due_date: '2026-11-30' },
  { id: 'c', amount: 12980, due_date: '2026-10-15' }, // overdue, nothing paid
  { id: 'd', amount: 1000, due_date: '2026-10-30' }, // due today: not overdue yet, due this month
  { id: 'e', amount: 500, due_date: '2026-10-31' }, // due this month
  { id: 'f', amount: 10030, due_date: '2026-11-30' }, // fully paid
]
const payments = [
  { invoice_id: 'a', amount: 2000, payment_date: '2026-10-30' },
  { invoice_id: 'f', amount: 4000, payment_date: '2026-10-30' },
  { invoice_id: 'f', amount: 6030, payment_date: '2026-10-30' },
  { invoice_id: 'x', amount: 530, payment_date: '2026-10-02' },
  { invoice_id: 'y', amount: 999, payment_date: '2026-09-30' }, // last month
]
const paid = paidByInvoice(payments)
assert.equal(invoiceBalance(invoices[0], paid), 6879.5, 'partial payment reduces the balance')
assert.equal(invoiceBalance(invoices[5], paid), 0, 'fully paid')
assert.equal(invoiceBalance({ id: 'z', amount: 100, due_date: null }, new Map([['z', 150]])), 0, 'never negative')

const s = summarizeReceivables(invoices, payments, today)
assert.equal(s.outstanding, 6879.5 + 3776 + 12980 + 1000 + 500, 'outstanding is balances, not invoice amounts')
assert.equal(s.overdue, 12980, 'only past-due balances; due today is not overdue')
assert.equal(s.dueThisMonth, 1000 + 500, 'due today and later this month')
assert.equal(s.paidThisMonth, 2000 + 4000 + 6030 + 530, 'cash received this month, partial payments included, last month excluded')

assert.deepEqual(summarizeReceivables([], [], today), { outstanding: 0, overdue: 0, dueThisMonth: 0, paidThisMonth: 0 })
assert.equal(summarizeReceivables([{ id: 'q', amount: '100', due_date: null }], [], today).outstanding, 100, 'string amounts and no due date')
assert.equal(summarizeReceivables([{ id: 'q', amount: 0.1, due_date: null }, { id: 'r', amount: 0.2, due_date: null }], [], today).outstanding, 0.3, 'no float drift')
// December month end
assert.equal(summarizeReceivables([{ id: 'q', amount: 5, due_date: '2026-12-31' }], [], '2026-12-02').dueThisMonth, 5)
// India date: 20:00 UTC on the 29th is already the 30th in India
assert.equal(businessToday(Date.UTC(2026, 9, 29, 20, 0, 0)), '2026-10-30')
console.log('receivables tests: all assertions passed')
