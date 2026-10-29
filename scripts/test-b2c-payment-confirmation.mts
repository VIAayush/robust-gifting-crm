// B2C payment confirmation: decision rules, track link/prefill, initiatePayment / completeDemoPayment, the
// confirmation loader (self-heal) and the PayU callback. Isolated: in-memory fake database, stubbed fetch (no PayU, no
// email/WhatsApp ever sent), next/navigation redirect stub. Row-level security and real Postgres are NOT exercised.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, call, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { decideConfirmationState, pendingAction, trackOrderHref, sortPaymentsNewestFirst } from '../src/lib/checkout/confirmation-state.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { parseOrderNumberParam, normalizeOrderNumber } from '../src/lib/orders/tracking-lookup.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { initiatePayment, completeDemoPayment, checkPaymentStatus } from '../src/app/checkout/[id]/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { loadConfirmation } from '../src/lib/checkout/confirmation-load.ts'
import { register } from 'node:module'
// The shared alias hook does not map the extension-less 'next/server'; map it here (this test file only).
register('data:text/javascript,' + encodeURIComponent("export async function resolve(s,c,n){return n(s==='next/server'?'next/server.js':s,c)}"))
// @ts-expect-error -- loaded after the hook above is registered
const { POST: payuCallback } = (await import('../src/app/api/payments/payu/callback/route.ts')) as { POST: (r: Request) => Promise<Response> }

let n = 0
const ok = (cond: unknown, msg: string) => { n++; assert.ok(cond, msg) }
const eq = (a: unknown, b: unknown, msg: string) => { n++; assert.deepEqual(a, b, msg) }

delete process.env.WHATSAPP_PROVIDER
delete process.env.RESEND_API_KEY
delete process.env.PAYMENT_PROVIDER
process.env.PAYU_KEY = 'testkey'
process.env.PAYU_SALT = 'testsalt'
const quiet = console.error
console.error = () => undefined

// ---- fetch stub: only PayU verify is answerable; anything else (email/WhatsApp) would be a bug
let payuMode: 'success' | 'wrong_amount' | 'failure' | 'down' | 'pending' = 'success'
let payuAmount = '100.00'
let payuCalls = 0
const strayFetches: string[] = []
globalThis.fetch = (async (url: unknown, init?: { body?: URLSearchParams }) => {
  const u = String(url)
  if (!u.includes('payu.in')) { strayFetches.push(u); throw new Error('unexpected network call') }
  payuCalls++
  if (payuMode === 'down') throw new Error('network down')
  const txn = String(init?.body?.get('var1'))
  const status = payuMode === 'failure' ? 'failure' : payuMode === 'pending' ? 'pending' : 'success'
  const amt = payuMode === 'wrong_amount' ? '1.00' : payuAmount
  return new Response(JSON.stringify({ status: 1, transaction_details: { [txn]: { status, amt, mihpayid: 'MP123', error_Message: 'declined' } } }), { status: 200 })
}) as typeof fetch

const CO = '50000000-0000-4000-8000-0000000000a1'
const PAY = '60000000-0000-4000-8000-0000000000a1'
const T = (min: number) => new Date(Date.UTC(2026, 9, 29, 10, min)).toISOString()

function world(opts: { provider?: 'demo' | 'payu'; status?: string } = {}) {
  const db = new FakeDb()
  install(db)
  db.unique['orders'] = 'storefront_checkout_id'
  db.unique['notification_outbox'] = 'dedupe_key'
  let seq = 0
  db.rpcHandlers['next_order_number'] = () => ({ data: `RG-${1000 + ++seq}` })
  db.rpcHandlers['next_invoice_number'] = () => ({ data: `INV-${1000 + seq}` })
  db.seed('storefront_checkouts', [{
    id: CO, status: 'pending', order_id: null, company_id: null, contact_id: null, customer_name: 'Asha', customer_email: 'asha@shopper.test',
    customer_phone: '9876543210', delivery_address_line: '1 Road', delivery_city: 'Pune', delivery_state: 'MH', delivery_postal_code: '411001', delivery_country: 'India', total_amount: 100,
  }])
  db.seed('storefront_checkout_items', [{ checkout_id: CO, product_id: 'p1', variant_id: null, quantity: 1, unit_price: 100, mrp_snapshot: 100, line_total: 100, customization: null }])
  db.seed('profiles', [])
  db.seed('storefront_payments', [{
    id: PAY, checkout_id: CO, provider: opts.provider ?? 'demo', provider_txn_id: 'RGTXN1', status: opts.status ?? 'pending', amount: 100, created_at: T(1),
    // the fake database ignores embeds, so give notifyPaymentResult the embedded checkout it would get from Postgres
    checkout: { customer_name: 'Asha', customer_phone: '9876543210', order: { order_number: 'X' } },
  }])
  return db
}
const payments = (db: InstanceType<typeof FakeDb>) => db.rows('storefront_payments') as { id: string; status: string; failure_reason?: string }[]
const payment = (db: InstanceType<typeof FakeDb>, id = PAY) => payments(db).find((p) => p.id === id)!
const orders = (db: InstanceType<typeof FakeDb>) => db.rows('orders')
const paymentNotes = (db: InstanceType<typeof FakeDb>) => db.rows('notification_outbox').filter((r) => String(r.event_type).startsWith('payment_'))
const orderNotes = (db: InstanceType<typeof FakeDb>) => db.rows('notification_outbox').filter((r) => r.event_type === 'order_created' && r.channel === 'whatsapp' && r.recipient_type === 'customer')

// ================= pure decision rules
const P = (status: string, min: number, provider = 'demo') => ({ id: `${status}${min}`, status, provider, created_at: T(min) })
const st = (hasOrder: boolean, ps: ReturnType<typeof P>[]) => decideConfirmationState({ hasOrder, payments: ps }).state
eq(st(true, [P('paid', 1)]), 'confirmed', 'paid + order => confirmed')
eq(st(false, [P('paid', 1)]), 'finalising', 'paid without order => finalising (repair)')
eq(st(true, [P('pending', 1)]), 'unknown', 'order without a paid payment is NOT confirmed')
eq(st(true, [P('failed', 1)]), 'unknown', 'order + failed payment is inconsistent, not confirmed')
eq(st(true, []), 'unknown', 'order and no payments is not confirmed')
eq(st(false, [P('pending', 1)]), 'pending', 'pending')
eq(st(false, [P('processing', 1, 'payu')]), 'pending', 'processing')
eq(st(false, [P('failed', 1)]), 'failed', 'failed')
eq(st(false, [P('cancelled', 1)]), 'failed', 'cancelled')
eq(st(false, []), 'unknown', 'no payments')
eq(st(false, [P('failed', 1), P('paid', 2)]), 'finalising', 'a later paid beats an earlier failed')
eq(st(true, [P('paid', 2), P('failed', 1)]), 'confirmed', 'order of the array does not matter')
eq(st(true, [P('failed', 5), P('paid', 1)]), 'confirmed', 'an earlier paid is not undone by a later failed attempt')
eq(st(false, [P('failed', 1), P('pending', 2)]), 'pending', 'newest attempt decides when nothing is paid')
eq(st(false, [P('pending', 2), P('failed', 1)]), 'pending', 'newest attempt decides regardless of array order')
eq(sortPaymentsNewestFirst([P('failed', 1), P('paid', 3), P('pending', 2)]).map((p: { status: string }) => p.status), ['paid', 'pending', 'failed'], 'newest first')
eq(pendingAction(P('processing', 1, 'payu')), 'verify', 'PayU processing => verify')
eq(pendingAction(P('pending', 1, 'payu')), 'back_to_payment', 'PayU pending => back to payment')
eq(pendingAction(P('pending', 1, 'demo')), 'back_to_payment', 'demo => back to payment')
eq(pendingAction(P('processing', 1, 'demo')), 'back_to_payment', 'demo processing never re-verifies')
eq(pendingAction(null), 'back_to_payment', 'no payment')

// ================= track link + prefill
eq(trackOrderHref('rg-1001'), '/track-order?order=RG-1001', 'link carries the normalised order number')
eq(trackOrderHref(''), '/track-order', 'no number => bare link')
ok(!/@|email|phone/i.test(trackOrderHref('RG-1001')), 'no email/phone in the link')
eq(parseOrderNumberParam('rg-1001'), 'RG-1001', 'prefill is normalised')
eq(parseOrderNumberParam(' rg 1001 '), 'RG1001', 'whitespace normalised')
eq(parseOrderNumberParam('<script>alert(1)</script>'), '', 'junk ignored')
eq(parseOrderNumberParam('a@b.com'), '', 'an email in the order param is ignored')
eq(parseOrderNumberParam(['RG-1', 'RG-2']), '', 'repeated param ignored')
eq(parseOrderNumberParam(undefined), '', 'missing param')
eq(parseOrderNumberParam('x'.repeat(41)), '', 'too long')
eq(parseOrderNumberParam('ab'), '', 'too short')
eq(normalizeOrderNumber(parseOrderNumberParam('RG-1001')), 'RG-1001', 'idempotent')

// ================= demo payment: success claims once, one order, repeat is a no-op
{
  const db = world()
  const r = await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'success' })))
  eq(r, { redirected: `/checkout/${CO}/confirmation` }, 'success goes to confirmation')
  eq(payment(db).status, 'paid', 'payment paid')
  eq(orders(db).length, 1, 'exactly one order')
  eq(paymentNotes(db).length, 1, 'one payment notification')
  eq(orderNotes(db).length, 1, 'one order notification')
  const writes = db.writes.length
  const again = await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'success' })))
  eq(again, { redirected: `/checkout/${CO}/pay` }, 'second submission is refused (payment no longer pending)')
  eq(db.writes.length, writes, 'second submission writes nothing')
  eq(orders(db).length, 1, 'still one order')
  eq(paymentNotes(db).length, 1, 'still one payment notification')

  // refresh of the confirmation page: confirmed, no new order/payment/notification
  const admin = db.client() as never
  const v1 = await loadConfirmation(admin, CO)
  const v2 = await loadConfirmation(admin, CO)
  eq(v1?.state, 'confirmed', 'confirmed after paid + order')
  ok(v1?.orderNumber && /^RG-/.test(v1.orderNumber), 'shows the persisted order number')
  eq(v2?.orderNumber, v1?.orderNumber, 'refresh shows the same number')
  eq(orders(db).length, 1, 'refresh creates no order')
  eq(payments(db).length, 1, 'refresh creates no payment')
  eq(paymentNotes(db).length + orderNotes(db).length, 2, 'refresh sends no notification')
  ok(!('customer_email' in (v1!.checkout as object)) && !JSON.stringify(v1).includes('asha@shopper.test') && !JSON.stringify(v1).includes('9876543210'), 'view carries no email/phone')
}

// ================= concurrent double-submit: still one order
{
  const db = world()
  await Promise.all([
    call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'success' }))),
    call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'success' }))),
  ])
  eq(orders(db).length, 1, 'concurrent submissions create one order')
  eq(paymentNotes(db).length, 1, 'and one payment notification')
}

// ================= paid without order (order creation failed) -> never a new payment; repair; self-heal
{
  const db = world()
  db.writeErrors['orders'] = { message: 'db down' }
  const r = await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'success' })))
  eq(r, { redirected: `/checkout/${CO}/confirmation` }, 'a failed order step does NOT bounce the customer back to pay')
  eq(payment(db).status, 'paid', 'payment stays paid')
  eq(orders(db).length, 0, 'no order yet')
  eq(paymentNotes(db).length, 0, 'no payment notification with a blank order number')

  const admin = db.client() as never
  const stuck = await loadConfirmation(admin, CO)
  eq(stuck?.state, 'finalising', 'page shows finalising while repair fails')
  eq(stuck?.orderNumber, null, 'no order number while finalising')

  const before = payments(db).length
  const pay = await call(() => initiatePayment(form({ checkout_id: CO })))
  eq(pay, { redirected: `/checkout/${CO}/confirmation` }, 'initiatePayment refuses a new attempt when already paid')
  eq(payments(db).length, before, 'no new payment row (no double charge)')

  delete db.writeErrors['orders']
  const pay2 = await call(() => initiatePayment(form({ checkout_id: CO })))
  eq(pay2, { redirected: `/checkout/${CO}/confirmation` }, 'repair path ends at confirmation')
  eq(orders(db).length, 1, 'initiatePayment repaired the order once')
  eq(payments(db).length, before, 'still no new payment')
  eq(paymentNotes(db).length, 1, 'payment notification sent once after repair')
  await call(() => initiatePayment(form({ checkout_id: CO })))
  eq(orders(db).length, 1, 'idempotent')
  eq(paymentNotes(db).length, 1, 'still one notification')
}
{
  // page self-heal (no initiatePayment involved)
  const db = world({ status: 'paid' })
  const admin = db.client() as never
  const v = await loadConfirmation(admin, CO)
  eq(v?.state, 'confirmed', 'page repaired the order and confirms')
  ok(Boolean(v?.orderNumber), 'order number present after repair')
  const v2 = await loadConfirmation(admin, CO)
  eq(v2?.orderNumber, v?.orderNumber, 'refresh stable')
  eq(orders(db).length, 1, 'one order after two renders')
  eq(paymentNotes(db).length, 1, 'one payment notification after two renders')
  eq(orderNotes(db).length, 1, 'one order notification after two renders')
}

// ================= order without a paid payment is never presented as confirmed
{
  const db = world({ status: 'failed' })
  db.seed('orders', [{ id: 'o-x', order_number: 'RG-9', storefront_checkout_id: CO }])
  const v = await loadConfirmation(db.client() as never, CO)
  eq(v?.state, 'unknown', 'inconsistent order without paid payment is not confirmed')
  eq(v?.orderNumber, null, 'and shows no order number')
  const db2 = world({ status: 'pending' })
  db2.seed('orders', [{ id: 'o-y', order_number: 'RG-9', storefront_checkout_id: CO }])
  eq((await loadConfirmation(db2.client() as never, CO))?.orderNumber, null, 'pending payment + order: no number')
}

// ================= pending / failed / cancelled / unknown checkout
{
  const db = world()
  const v = await loadConfirmation(db.client() as never, CO)
  eq(v?.state, 'pending', 'pending payment')
  eq(v?.orderNumber, null, 'pending never shows a number')
  eq(v?.action, 'back_to_payment', 'demo pending offers back to payment')
  eq(await loadConfirmation(db.client() as never, '50000000-0000-4000-8000-0000000000ff'), null, 'unknown checkout => null (page calls notFound)')
  const dbp = world({ provider: 'payu', status: 'processing' })
  const vp = await loadConfirmation(dbp.client() as never, CO)
  eq([vp?.state, vp?.action, vp?.orderNumber], ['pending', 'verify', null], 'PayU processing offers Check payment status, no number')
}
{
  const db = world()
  await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'failure' })))
  eq(payment(db).status, 'failed', 'demo failure')
  eq(orders(db).length, 0, 'no order on failure')
  eq(paymentNotes(db).length, 1, 'failure notified once')
  await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'failure' })))
  eq(paymentNotes(db).length, 1, 'repeat failure does not re-notify')
  const v = await loadConfirmation(db.client() as never, CO)
  eq([v?.state, v?.orderNumber], ['failed', null], 'failed state, no number')
  const retry = await call(() => initiatePayment(form({ checkout_id: CO })))
  eq(retry, { redirected: `/checkout/${CO}/pay` }, 'Try Again after failure starts a fresh attempt')
  eq(payments(db).length, 2, 'new pending attempt created')
  ;(payments(db)[1] as { created_at?: string }).created_at = T(30) // Postgres fills this default; the fake does not
  const v2 = await loadConfirmation(db.client() as never, CO)
  eq(v2?.state, 'pending', 'the new attempt is now the one that counts')
}
{
  const db = world()
  const r = await call(() => completeDemoPayment(form({ checkout_id: CO, payment_id: PAY, outcome: 'cancel' })))
  eq(r, { redirected: `/checkout/${CO}/review` }, 'cancel goes back to review')
  eq(payment(db).status, 'cancelled', 'cancelled')
  eq((await loadConfirmation(db.client() as never, CO))?.state, 'failed', 'cancelled shows the try-again state')
  eq(orders(db).length, 0, 'no order')
}
{
  // a PayU payment that may still turn out paid blocks a second attempt
  const db = world({ provider: 'payu', status: 'processing' })
  const before = payments(db).length
  eq(await call(() => initiatePayment(form({ checkout_id: CO }))), { redirected: `/checkout/${CO}/confirmation` }, 'processing PayU payment: no new attempt')
  eq(payments(db).length, before, 'no new payment row')
}

// ================= PayU callback
const reverseHash = (f: Record<string, string>) =>
  crypto.createHash('sha512').update(['testsalt', f.status, '', '', '', '', '', '', '', '', '', '', f.email, f.firstname, f.productinfo, f.amount, f.txnid, 'testkey'].join('|')).digest('hex')
function callbackRequest(extra: Record<string, string> = {}, signed = true) {
  const f: Record<string, string> = { txnid: 'RGTXN1', status: 'success', email: 'asha@shopper.test', firstname: 'Asha', productinfo: 'x', amount: '100.00', ...extra }
  f.hash = signed ? reverseHash(f) : 'deadbeef'
  const body = new URLSearchParams(f)
  return new Request('http://localhost:3000/api/payments/payu/callback', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
}
const location = (res: Response) => new URL(res.headers.get('location')!).pathname
payuMode = 'success'
{
  const db = world({ provider: 'payu' })
  payuCalls = 0
  const res = await payuCallback(callbackRequest())
  eq(location(res), `/checkout/${CO}/confirmation`, 'callback redirects to confirmation')
  eq([payment(db).status, orders(db).length, paymentNotes(db).length, orderNotes(db).length], ['paid', 1, 1, 1], 'verified paid => paid, one order, one notification each')
  const calls = payuCalls
  const dup = await payuCallback(callbackRequest())
  eq(location(dup), `/checkout/${CO}/confirmation`, 'duplicate delivery redirects')
  eq([payment(db).status, orders(db).length, paymentNotes(db).length, orderNotes(db).length], ['paid', 1, 1, 1], 'duplicate callback is a no-op')
  eq(payuCalls, calls, 'duplicate does not even call PayU')
  // a duplicate that races past the status check is stopped by the conditional claim
  const db2 = world({ provider: 'payu' })
  await Promise.all([payuCallback(callbackRequest()), payuCallback(callbackRequest())])
  eq([payment(db2).status, orders(db2).length, paymentNotes(db2).length], ['paid', 1, 1], 'concurrent duplicates: one order, one notification')
}
{
  // hash mismatch: nothing changes state, PayU is not even asked
  const db = world({ provider: 'payu' })
  payuCalls = 0
  await payuCallback(callbackRequest({ status: 'failure' }, false))
  eq([payment(db).status, orders(db).length, payuCalls], ['pending', 0, 0], 'unverifiable POST cannot change state')
}
{
  // amount mismatch reported by PayU: not paid, no order
  payuMode = 'wrong_amount'
  const db = world({ provider: 'payu' })
  await payuCallback(callbackRequest())
  eq([payment(db).status, orders(db).length], ['failed', 0], 'amount mismatch is treated as not paid')
  ok(/Amount mismatch/.test(String(payment(db).failure_reason)), 'reason recorded for review')
  eq((await loadConfirmation(db.client() as never, CO))?.failureReason, null, 'internal amount-mismatch reason is not shown to the customer')
  payuMode = 'success'
}
{
  // browser says success but PayU says failure / the POST claims failure but PayU says paid: PayU decides
  payuMode = 'failure'
  const db = world({ provider: 'payu' })
  await payuCallback(callbackRequest({ status: 'success' }))
  eq([payment(db).status, orders(db).length], ['failed', 0], 'PayU failure wins over a success-looking POST')
  payuMode = 'success'
  const db2 = world({ provider: 'payu' })
  await payuCallback(callbackRequest({ status: 'failure' }))
  eq([payment(db2).status, orders(db2).length], ['paid', 1], 'PayU success wins over a failure-looking POST')
}
{
  // verify unreachable: stays processing; Check payment status then resolves it
  payuMode = 'down'
  const db = world({ provider: 'payu' })
  await payuCallback(callbackRequest())
  eq([payment(db).status, orders(db).length, paymentNotes(db).length], ['processing', 0, 0], 'unreachable verify => processing, nothing guessed')
  const v = await loadConfirmation(db.client() as never, CO)
  eq([v?.state, v?.action, v?.orderNumber], ['pending', 'verify', null], 'page offers Check payment status, never a number')
  await call(() => checkPaymentStatus(form({ checkout_id: CO })))
  eq(payment(db).status, 'processing', 'still unreachable: still processing')
  payuMode = 'success'
  const r = await call(() => checkPaymentStatus(form({ checkout_id: CO })))
  eq(r, { redirected: `/checkout/${CO}/confirmation` }, 'check returns to confirmation')
  eq([payment(db).status, orders(db).length, paymentNotes(db).length], ['paid', 1, 1], 'reachable now: paid, one order, one notification')
  await call(() => checkPaymentStatus(form({ checkout_id: CO })))
  eq([orders(db).length, paymentNotes(db).length], [1, 1], 'repeating the check is a no-op')
  eq((await loadConfirmation(db.client() as never, CO))?.state, 'confirmed', 'confirmed after verification')
}
{
  // check never touches demo or pending payments
  const db = world({ provider: 'demo', status: 'processing' })
  payuCalls = 0
  await call(() => checkPaymentStatus(form({ checkout_id: CO })))
  eq([payuCalls, payment(db).status], [0, 'processing'], 'demo payments are never re-verified with PayU')
  const db2 = world({ provider: 'payu', status: 'pending' })
  await call(() => checkPaymentStatus(form({ checkout_id: CO })))
  eq([payuCalls, payment(db2).status], [0, 'pending'], 'a pending PayU payment is not touched by the check')
  eq(await call(() => checkPaymentStatus(form({ checkout_id: 'nope' }))), { redirected: '/cart' }, 'malformed id refused')
}
{
  // a demo payment's txnid posted to the PayU callback is ignored
  const db = world({ provider: 'demo' })
  payuCalls = 0
  await payuCallback(callbackRequest())
  eq([payment(db).status, orders(db).length, payuCalls], ['pending', 0, 0], 'demo payment cannot be settled via the PayU callback')
}

eq(strayFetches, [], 'no email/WhatsApp/other network call was ever attempted')
console.error = quiet
console.log(`b2c payment confirmation tests: ${n} assertions passed`)
