// Sample request handling: stock moves once, never for a handled request, and a failed move puts the request back.
// move_sample (the atomic database function) is faked here, so atomicity of the stock counts is BLOCKED until a database exists.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { fulfillSampleRequest, updateSampleRequestStatus } from '../src/app/crm/samples/actions.ts'

const quiet = console.error
console.error = () => undefined
const REQ = 'a0000000-0000-4000-8000-000000000001'
const form = (values: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f }

function world(status: string) {
  const db = new FakeDb()
  install(db)
  const ids = { ops: profile(db, 'operations'), accounts: profile(db, 'accounts'), client: profile(db, 'client_admin', { company_id: 'c1' }) }
  db.seed('sample_requests', [{ id: REQ, product_id: 'p1', company_id: 'c1', quantity: 2, status }])
  db.seed('sample_stock', [{ id: 's1', product_id: 'p1', in_office: 10, unit_cost: 5 }])
  let moves = 0
  db.rpcHandlers.move_sample = () => { moves++; return { data: 'm-' + moves } }
  return { db, ids, moves: () => moves }
}
const reqStatus = (db: InstanceType<typeof FakeDb>) => (db.rows('sample_requests')[0] as { status: string }).status
const redirected = (r: unknown) => (r as { redirected?: string })?.redirected || ''

for (const state of ['shipped', 'rejected']) {
  const w = world(state)
  signIn(w.db, w.ids.ops)
  const r = await call(() => fulfillSampleRequest(form({ request_id: REQ })))
  assert.match(redirected(r), /error=/, `a ${state} request is refused`)
  assert.equal(w.moves(), 0, `a ${state} request never moves stock`)
  assert.equal(reqStatus(w.db), state)
}
for (const role of ['accounts', 'client'] as const) {
  const w = world('pending')
  signIn(w.db, w.ids[role])
  await call(() => fulfillSampleRequest(form({ request_id: REQ })))
  assert.equal(w.moves(), 0, `${role} cannot fulfil requests`)
  assert.equal(reqStatus(w.db), 'pending')
}
{
  const w = world('approved')
  signIn(w.db, w.ids.ops)
  const first = await call(() => fulfillSampleRequest(form({ request_id: REQ })))
  assert.match(redirected(first), /fulfilled=1/)
  assert.equal(reqStatus(w.db), 'shipped')
  assert.equal(w.moves(), 1)
  const second = await call(() => fulfillSampleRequest(form({ request_id: REQ })))
  assert.match(redirected(second), /error=/, 'a second click is refused')
  assert.equal(w.moves(), 1, 'stock moved exactly once')
}
{
  // not enough stock: the database function refuses; the request returns to its previous status
  const w = world('pending')
  w.db.rpcHandlers.move_sample = () => ({ error: { message: 'Not enough samples in office' } })
  signIn(w.db, w.ids.ops)
  const r = await call(() => fulfillSampleRequest(form({ request_id: REQ })))
  assert.match(redirected(r), /error=/)
  assert.equal(reqStatus(w.db), 'pending', 'a failed movement leaves the request open to retry')
}
{
  // approve / reject only while the request is open
  const w = world('shipped')
  signIn(w.db, w.ids.ops)
  assert.match(redirected(await call(() => updateSampleRequestStatus(form({ request_id: REQ, status: 'rejected' })))), /error=/)
  assert.equal(reqStatus(w.db), 'shipped', 'a shipped request cannot be rejected afterwards')
  const open = world('pending')
  signIn(open.db, open.ids.ops)
  assert.match(redirected(await call(() => updateSampleRequestStatus(form({ request_id: REQ, status: 'approved' })))), /updated=1/)
  assert.equal(reqStatus(open.db), 'approved')
  assert.match(redirected(await call(() => updateSampleRequestStatus(form({ request_id: REQ, status: 'shipped' })))), /error=/, "only approve / reject can be set by hand")
}
console.error = quiet
console.log('sample request tests: all assertions passed')
