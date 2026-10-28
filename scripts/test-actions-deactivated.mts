// A deactivated staff account must lose every server-action power at once (application layer; the database helpers
// has_any_role / is_admin / current_role honour is_active from migration 20261039 on, which is checked against the
// real database separately). Called directly with an in-memory fake database.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { recordPayment } from '../src/app/crm/invoices/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { saveOrderCosting } from '../src/app/crm/orders/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { updateTeamMember } from '../src/app/crm/team/actions.ts'

const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const INVOICE = '20000000-0000-4000-8000-000000000001'
const ORDER = '30000000-0000-4000-8000-000000000001'

function world() {
  const db = new FakeDb()
  install(db)
  db.seed('invoices', [{ id: INVOICE, amount: 1000 }])
  db.seed('payments', [{ invoice_id: INVOICE, amount: 100 }])
  db.seed('orders', [{ id: ORDER, order_number: 'ORD-1', company_id: 'c1', status: 'created', order_value: 5000, product_cost: 0, printing_cost: 0, courier_cost: 0, other_cost: 0 }])
  db.rpcHandlers.refresh_invoice_status = () => ({ data: null })
  db.rpcHandlers.recalc_order_cost = () => ({ data: null })
  return db
}
const pay = () => form({ invoice_id: INVOICE, amount: '200', method: 'upi', payment_date: today })
const costing = () => form({ order_id: ORDER, product_cost: '100', printing_cost: '10', courier_cost: '5', other_cost: '0' })

// Active users still work (so the test proves the refusal is about is_active, not about the setup).
{
  const db = world()
  signIn(db, profile(db, 'accounts'))
  assert.ok(isSuccess(await call(() => recordPayment(pay()))), 'an active accounts user may record a payment')
  signIn(db, profile(db, 'admin'))
  assert.ok(isSuccess(await call(() => saveOrderCosting(costing()))), 'an active admin may save order costing')
}

// The same roles, deactivated, are refused and nothing is written.
for (const role of ['admin', 'accounts', 'management'] as const) {
  const db = world()
  signIn(db, profile(db, role, { is_active: false }))
  const payment = await call(() => recordPayment(pay()))
  assert.ok(isError(payment) || (payment as { redirected?: string }).redirected, `deactivated ${role} must not record a payment`)
  const cost = await call(() => saveOrderCosting(costing()))
  assert.ok(isError(cost) || (cost as { redirected?: string }).redirected, `deactivated ${role} must not edit order costing`)
  assert.equal(db.writes.filter((w: string) => w !== 'audit_logs:insert').length, 0, `deactivated ${role}: nothing may be written (${db.writes.join(',')})`)
}

// Team screen: a deactivated admin cannot change roles or activate accounts; an active admin can, and it is audited.
{
  const db = world()
  const target = profile(db, 'sales')
  const change = () => form({ id: target, role: 'operations', is_active: 'true' })
  signIn(db, profile(db, 'admin', { is_active: false }))
  assert.ok(isError(await call(() => updateTeamMember(change()))), 'a deactivated admin must not change team roles')
  assert.equal(db.rows('profiles').find((p: Record<string, unknown>) => p.id === target)?.role, 'sales', 'the role is untouched')
  assert.equal(db.writes.length, 0, 'nothing is written')

  signIn(db, profile(db, 'admin'))
  assert.ok(isSuccess(await call(() => updateTeamMember(change()))), 'an active admin may change a role')
  assert.equal(db.rows('profiles').find((p: Record<string, unknown>) => p.id === target)?.role, 'operations')
  const audit = db.rows('audit_logs').find((r: Record<string, unknown>) => r.action === 'role_change')
  assert.ok(audit, 'the role change is audited')
  assert.equal(audit.entity, 'profiles')
}

console.log('deactivated user action tests: all assertions passed')
