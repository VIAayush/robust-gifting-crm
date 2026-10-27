// Quotation status rules (CRM) and the client's response path (portal), called as server actions on an in-memory database.
// The database functions client_respond_quotation* are NOT executed here (BLOCKED until a database exists); their
// expiry check lives in migration 33 and is verified by the SQL review + a post-migration query list.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { updateQuotationStatus } from '../src/app/crm/quotations/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { respondToQuotation, respondToQuotationItems } from '../src/app/portal/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { quotationExpired } from '../src/lib/quotations/validity.ts'

const quiet = console.error
console.error = () => undefined
const Q = '90000000-0000-4000-8000-000000000001'
const Q_EMPTY = '90000000-0000-4000-8000-000000000002'
const ITEM = '91000000-0000-4000-8000-000000000001'

const today = new Date(Date.now() + 5.5 * 3600 * 1000)
const day = (offset: number) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10)

function world(status = 'draft', validUntil: string | null = day(7)) {
  const db = new FakeDb()
  install(db)
  const ids = {
    sales: profile(db, 'sales'),
    accounts: profile(db, 'accounts'),
    operations: profile(db, 'operations'),
    client: profile(db, 'client_admin', { company_id: 'c1' }),
    otherClient: profile(db, 'client_admin', { company_id: 'c2' }),
  }
  db.seed('quotations', [
    { id: Q, status, company_id: 'c1', requirement_id: null, valid_until: validUntil },
    { id: Q_EMPTY, status: 'draft', company_id: 'c1', requirement_id: null, valid_until: validUntil },
  ])
  db.seed('quotation_items', [{ id: ITEM, quotation_id: Q, quantity: 1, unit_price: 10 }])
  db.rpcHandlers.client_company_id = (_a: unknown, d: InstanceType<typeof FakeDb>) => ({ data: (d.rows('profiles').find((p) => p.id === d.user?.id) as { company_id: string | null } | undefined)?.company_id ?? null })
  db.rpcHandlers.client_respond_quotation = () => ({ data: null })
  db.rpcHandlers.client_respond_quotation_items = () => ({ data: null })
  return { db, ids }
}
const status = (db: InstanceType<typeof FakeDb>, id = Q) => (db.rows('quotations').find((q) => q.id === id) as { status: string }).status

// ---- the validity helper (India date, whole valid_until day counts)
assert.equal(quotationExpired(null), false)
assert.equal(quotationExpired(day(0)), false, 'valid through the whole of its last day')
assert.equal(quotationExpired(day(-1)), true)
assert.equal(quotationExpired(day(5)), false)
assert.equal(quotationExpired('2026-10-01', new Date('2026-10-01T20:00:00Z')), true, '20:00 UTC is already the next day in India')
assert.equal(quotationExpired('2026-10-01', new Date('2026-10-01T10:00:00Z')), false)

// ---- CRM status changes
for (const role of ['accounts', 'operations', 'client', 'otherClient'] as const) {
  const { db, ids } = world('draft')
  signIn(db, ids[role])
  assert.ok(isError(await call(() => updateQuotationStatus(Q, 'sent'))), `${role} cannot change a quotation's status`)
  assert.equal(status(db), 'draft')
}
{
  const { db, ids } = world('draft')
  signIn(db, ids.sales)
  assert.ok(isError(await call(() => updateQuotationStatus(Q_EMPTY, 'sent'))), 'a quotation with no items cannot be sent')
  assert.equal(status(db, Q_EMPTY), 'draft')
  assert.ok(isError(await call(() => updateQuotationStatus(Q, 'accepted'))), 'draft cannot jump to accepted')
  assert.ok(isError(await call(() => updateQuotationStatus(Q, 'nonsense'))))
  assert.ok(isSuccess(await call(() => updateQuotationStatus(Q, 'sent'))))
  assert.equal(status(db), 'sent')
  assert.ok(isError(await call(() => updateQuotationStatus(Q, 'draft'))), 'a sent quotation cannot go back to draft')
}
{
  // a viewed quotation can still be expired or closed by staff
  const { db, ids } = world('viewed')
  signIn(db, ids.sales)
  assert.ok(isSuccess(await call(() => updateQuotationStatus(Q, 'expired'))))
  assert.equal(status(db), 'expired')
  assert.ok(isSuccess(await call(() => updateQuotationStatus(Q, 'sent'))), 'an expired quotation can be re-sent')
}
{
  // the client answers between the staff member's read and write: the update must not overwrite the answer
  const { db, ids } = world('sent')
  signIn(db, ids.sales)
  let first = true
  db.rpcHandlers.__noop = () => ({ data: null })
  const originalRows = db.rows.bind(db)
  db.rows = (table: string) => {
    const rows = originalRows(table)
    if (table === 'quotations' && first) {
      first = false
      const snapshot = rows.map((r) => ({ ...r }))
      // after the first read, the client's answer lands
      queueMicrotask(() => { (originalRows('quotations').find((q) => q.id === Q) as { status: string }).status = 'accepted' })
      return snapshot
    }
    return rows
  }
  const result = await call(() => updateQuotationStatus(Q, 'expired'))
  assert.ok(isError(result), 'the stale update is refused')
  assert.equal(status(db), 'accepted', "the client's answer is kept")
}

// ---- client response
for (const [label, who] of [['another company', 'otherClient'], ['staff', 'sales']] as const) {
  const { db, ids } = world('sent')
  signIn(db, ids[who])
  assert.ok(isError(await call(() => respondToQuotation(Q, 'accepted'))), `${label} cannot answer this client's quotation`)
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name.startsWith('client_respond')).length, 0, `${label}: the response function is never called`)
}
{
  const { db, ids } = world('sent')
  signIn(db, ids.client)
  assert.ok(isSuccess(await call(() => respondToQuotation(Q, 'accepted', 'ok'))))
  assert.deepEqual(db.rpcCalls.find((c: { name: string }) => c.name === 'client_respond_quotation')?.args, { p_quotation_id: Q, p_accept: true, p_comment: 'ok' })
}
for (const state of ['draft', 'accepted', 'rejected', 'expired']) {
  const { db, ids } = world(state)
  if (state === 'draft') { /* a draft is not even visible to the client; the action still refuses */ }
  signIn(db, ids.client)
  assert.ok(isError(await call(() => respondToQuotation(Q, 'accepted'))), `a ${state} quotation cannot be answered`)
  assert.ok(isError(await call(() => respondToQuotationItems(Q, [{ itemId: ITEM, accept: true }]))))
}
{
  // past its validity date: refused in the application, and the database function is not reached
  const { db, ids } = world('sent', day(-1))
  signIn(db, ids.client)
  const r1 = await call(() => respondToQuotation(Q, 'accepted'))
  assert.ok(isError(r1) && /expired/i.test(r1.error), 'an expired quotation cannot be accepted')
  const r2 = await call(() => respondToQuotationItems(Q, [{ itemId: ITEM, accept: true }]))
  assert.ok(isError(r2) && /expired/i.test(r2.error))
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name.startsWith('client_respond')).length, 0)
  assert.equal(status(db), 'sent', 'nothing changed')
}
{
  // item decisions must cover every line exactly once, with real item ids
  const { db, ids } = world('sent')
  signIn(db, ids.client)
  assert.ok(isError(await call(() => respondToQuotationItems(Q, []))), 'no decisions')
  assert.ok(isError(await call(() => respondToQuotationItems(Q, [{ itemId: 'someone-elses-item', accept: true }]))), 'unknown item')
  assert.ok(isError(await call(() => respondToQuotationItems(Q, [{ itemId: ITEM, accept: true }, { itemId: ITEM, accept: false }]))), 'the same item twice')
  assert.ok(isSuccess(await call(() => respondToQuotationItems(Q, [{ itemId: ITEM, accept: false }]))))
}
console.error = quiet
console.log('quotation action tests: all assertions passed')
