// Email ledger and notification dedupe. Isolated: fake database with a unique dedupe_key, and a stubbed fetch so
// NO email is ever sent to a real provider. Proves the application's retry logic only (not Resend, not Postgres).
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { notifyRequirementEvent, notifyOrderStatusChanged, notifyProductsAvailable } from '../src/lib/notifications/index.ts'

process.env.RESEND_API_KEY = 'test-key-not-real'
process.env.RESEND_FROM_EMAIL = 'noreply@example.test'
delete process.env.WHATSAPP_PROVIDER
delete process.env.NOTIFY_STAFF_PHONES

const realFetch = globalThis.fetch
let mode: 'ok' | 'fail' | 'throw' = 'ok'
const sentTo: string[] = []
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  if (mode === 'throw') throw new Error('network down')
  if (mode === 'fail') return new Response('nope', { status: 500 })
  sentTo.push(JSON.parse(String(init?.body || '{}')).to)
  return new Response('{}', { status: 200 })
}) as typeof fetch
const quiet = console.error
console.error = () => undefined

const REQ = '80000000-0000-4000-8000-000000000001'
const ORDER = '80000000-0000-4000-8000-000000000002'

function world() {
  const db = new FakeDb()
  install(db)
  db.unique['notification_outbox'] = 'dedupe_key'
  profile(db, 'client_admin', { company_id: 'c1', email: 'a@client.test', phone: null })
  profile(db, 'client_user', { company_id: 'c1', email: 'b@client.test', phone: null })
  profile(db, 'client_user', { company_id: 'c2', email: 'other@elsewhere.test', phone: null })
  db.seed('requirements', [{ id: REQ, name: 'Diwali gifts', company_id: 'c1', owner_id: null, submitted_at: '2026-10-01T10:00:00Z', company: { name: 'Acme' } }])
  db.seed('orders', [{ id: ORDER, order_number: 'ORD-1', status: 'dispatched', updated_at: '2026-10-02T10:00:00Z', assigned_to: null, shipping_address: { name: 'Asha' }, storefront_checkout_id: 'co1', contact: null, company: { name: 'Acme' } }])
  db.seed('storefront_checkouts', [{ id: 'co1', customer_name: 'Asha', customer_email: 'asha@shopper.test' }])
  return db
}
const emailRows = (db: InstanceType<typeof FakeDb>) => db.rows('notification_outbox').filter((r) => r.channel === 'email')

// 1. the same requirement event twice sends each client user ONE email, only to their own company
{
  const db = world()
  await notifyRequirementEvent(REQ, 'quotation_sent')
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.deepEqual([...sentTo].sort(), ['a@client.test', 'b@client.test'], 'one email per user, none to another company')
  assert.ok(emailRows(db).every((r) => r.status === 'sent'))
  sentTo.length = 0
  // a resubmission is a new round and notifies again
  db.rows('requirements')[0].submitted_at = '2026-10-05T10:00:00Z'
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.equal(sentTo.length, 2, 'a new round is a new notification')
  sentTo.length = 0
}

// 2. a failed send is recorded as failed (never 'sent') and is retried once the provider recovers, without duplicates
{
  const db = world()
  mode = 'fail'
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.equal(sentTo.length, 0)
  assert.ok(emailRows(db).length === 2 && emailRows(db).every((r) => r.status === 'failed' && r.sent_at === undefined), 'unsent mail is never marked delivered')
  mode = 'ok'
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.equal(sentTo.length, 2, 'the failed mail is retried')
  assert.ok(emailRows(db).every((r) => r.status === 'sent'))
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.equal(sentTo.length, 2, 'a sent mail is never repeated')
  sentTo.length = 0
}

// 3. a thrown network error is also recorded as failed, not left as delivered or lost
{
  const db = world()
  mode = 'throw'
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.ok(emailRows(db).every((r) => r.status === 'failed' && /network down/.test(String(r.last_error))))
  mode = 'ok'
}

// 4. the retry budget is bounded
{
  const db = world()
  mode = 'fail'
  for (let i = 0; i < 10; i++) await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.ok(emailRows(db).every((r) => Number(r.attempts) <= 5), 'never more than 5 attempts per message')
  mode = 'ok'
}

// 5. order status: the same status reached again later notifies again; the same event twice does not
{
  const db = world()
  await notifyOrderStatusChanged(ORDER, 'Dispatched')
  await notifyOrderStatusChanged(ORDER, 'Dispatched')
  const first = sentTo.filter((t) => t === 'asha@shopper.test').length
  assert.equal(first, 1, 'repeat of the same event is deduped')
  db.rows('orders')[0].updated_at = '2026-10-09T10:00:00Z'
  await notifyOrderStatusChanged(ORDER, 'Dispatched')
  assert.equal(sentTo.filter((t) => t === 'asha@shopper.test').length, 2, 'returning to a status later notifies again')
  sentTo.length = 0
}

// 6. a ledger insert error other than "duplicate" must not send anything
{
  const db = world()
  db.writeErrors['notification_outbox'] = { code: '42501', message: 'permission denied' }
  await notifyRequirementEvent(REQ, 'quotation_sent')
  assert.equal(sentTo.length, 0, 'no ledger row, no email')
}

// 7. product-available emails: ledgered, retried after a failure, never repeated, set-specific
{
  const db = world()
  const ids = Array.from({ length: 12 }, (_, i) => `c0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
  db.seed('products', ids.map((id, i) => ({ id, name: `Gift ${i}`, status: 'active' })))
  mode = 'fail'
  await notifyProductsAvailable(['c1'], ids.slice(0, 3))
  assert.equal(sentTo.length, 0)
  assert.ok(emailRows(db).filter((r) => r.event_type === 'product_available').every((r) => r.status === 'failed'), 'a failed product mail is recorded as failed')
  mode = 'ok'
  await notifyProductsAvailable(['c1'], ids.slice(0, 3))
  assert.deepEqual([...sentTo].sort(), ['a@client.test', 'b@client.test'], 'the missed mails are delivered on the next save, to that company only')
  const notificationsAfterRetry = db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users').length
  await notifyProductsAvailable(['c1'], ids.slice(0, 3))
  assert.equal(sentTo.length, 2, 'a third save of the same set sends nothing')
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users').length, notificationsAfterRetry, 'and raises no second in-app notification')
  // a different set of products is a new announcement, even when the first ids are the same
  await notifyProductsAvailable(['c1'], ids.slice(0, 4))
  assert.equal(sentTo.length, 4, 'a different product set is announced again')
  sentTo.length = 0
}

console.error = quiet
globalThis.fetch = realFetch
console.log('notification ledger tests: all assertions passed')
