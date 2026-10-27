// Demo-payment forgery guards, PayU verify interpretation and the "failed attempt must not undo a paid checkout" rule.
// Isolated: in-memory fake database, no network, no PayU. Row-level security is NOT exercised here.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, call, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { completeDemoPayment } from '../src/app/checkout/[id]/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { interpretVerifyDetail } from '../src/lib/payments/payu-provider.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { markCheckoutFailedIfUnpaid } from '../src/lib/payments/checkout-state.ts'

const CO_A = '50000000-0000-4000-8000-00000000000a'
const CO_B = '50000000-0000-4000-8000-00000000000b'
const PAY_A = '60000000-0000-4000-8000-00000000000a'
const PAY_B = '60000000-0000-4000-8000-00000000000b'

function world() {
  const db = new FakeDb()
  install(db)
  db.seed('storefront_checkouts', [
    { id: CO_A, status: 'pending', order_id: null, total_amount: 100 },
    { id: CO_B, status: 'pending', order_id: null, total_amount: 900 },
  ])
  db.seed('storefront_payments', [
    { id: PAY_A, checkout_id: CO_A, provider: 'demo', status: 'pending', amount: 100 },
    { id: PAY_B, checkout_id: CO_B, provider: 'demo', status: 'pending', amount: 900 },
  ])
  return db
}
const status = (db: InstanceType<typeof FakeDb>, id: string) => (db.rows('storefront_payments').find((p) => p.id === id) as { status: string }).status

// ---- completeDemoPayment: forgery guards
delete process.env.PAYMENT_PROVIDER
{
  const db = world()
  await call(() => completeDemoPayment(form({ checkout_id: CO_A, payment_id: PAY_B, outcome: 'success' })))
  assert.equal(status(db, PAY_B), 'pending', 'a payment belonging to another checkout must not be completed')
  assert.equal(status(db, PAY_A), 'pending')
}
{
  const db = world()
  await call(() => completeDemoPayment(form({ checkout_id: "x' or 1=1", payment_id: PAY_A, outcome: 'success' })))
  await call(() => completeDemoPayment(form({ checkout_id: CO_A, payment_id: 'nope', outcome: 'success' })))
  assert.equal(status(db, PAY_A), 'pending', 'malformed ids are refused')
}
{
  // a real provider configured: the simulator is closed
  process.env.PAYMENT_PROVIDER = 'payu'
  process.env.PAYU_KEY = 'k'
  process.env.PAYU_SALT = 's'
  const db = world()
  await call(() => completeDemoPayment(form({ checkout_id: CO_A, payment_id: PAY_A, outcome: 'success' })))
  assert.equal(status(db, PAY_A), 'pending', 'demo completion is impossible while PayU is active')
  delete process.env.PAYMENT_PROVIDER
  delete process.env.PAYU_KEY
  delete process.env.PAYU_SALT
}
{
  // failure on one attempt must not fail a checkout that another attempt already paid
  const db = world()
  db.seed('storefront_payments', [{ checkout_id: CO_A, provider: 'demo', status: 'paid', amount: 100 }])
  await call(() => completeDemoPayment(form({ checkout_id: CO_A, payment_id: PAY_A, outcome: 'failure' })))
  assert.equal(status(db, PAY_A), 'failed')
  assert.equal((db.rows('storefront_checkouts').find((c) => c.id === CO_A) as { status: string }).status, 'pending', 'paid checkout is not marked failed')
}
{
  const db = world()
  await call(() => completeDemoPayment(form({ checkout_id: CO_A, payment_id: PAY_A, outcome: 'failure' })))
  assert.equal((db.rows('storefront_checkouts').find((c) => c.id === CO_A) as { status: string }).status, 'failed')
  // an ordered checkout is never marked failed
  const db2 = world()
  ;(db2.rows('storefront_checkouts')[0] as { order_id: string | null }).order_id = 'ord'
  assert.equal(await markCheckoutFailedIfUnpaid(db2.client() as never, CO_A), false)
}

// ---- interpretVerifyDetail
const ok = (r: unknown) => (r as { ok: boolean }).ok
const st = (r: unknown) => (r as { status?: string }).status
assert.equal(st(interpretVerifyDetail({ status: 'success', amt: '100.00', mihpayid: 'p1' }, 100, {})), 'paid')
assert.equal(st(interpretVerifyDetail({ status: 'success', amt: '99.00' }, 100, {})), 'failed', 'amount mismatch is never accepted as paid')
assert.equal(ok(interpretVerifyDetail({ status: 'success' }, 100, {})), false, 'success with no readable amount is ambiguous')
assert.equal(st(interpretVerifyDetail({ status: 'failure', error_Message: 'declined' }, 100, {})), 'failed')
assert.equal(st(interpretVerifyDetail({ status: 'userCancelled' }, 100, {})), 'failed')
for (const pending of ['pending', 'initiated', 'in progress', '', undefined]) {
  assert.equal(ok(interpretVerifyDetail({ status: pending }, 100, {})), false, `"${pending}" must stay unresolved, not failed`)
}

console.log('checkout/payment action tests: all assertions passed')
