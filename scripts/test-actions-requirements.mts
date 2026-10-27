// updateRequirementForm: staff-only, allow-listed, and it cannot move a client-workflow requirement around the approval flow.
// Isolated fake database: row-level security and the database workflow guard trigger are NOT exercised here.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { updateRequirementForm, createQuotationFromRequirement } from '../src/app/crm/requirements/actions.ts'

const STAFF_REQ = '70000000-0000-4000-8000-000000000001'
const FLOW_REQ = '70000000-0000-4000-8000-000000000002'
const SENT_REQ = '70000000-0000-4000-8000-000000000003'

function world() {
  const db = new FakeDb()
  install(db)
  const ids = { sales: profile(db, 'sales'), client: profile(db, 'client_admin', { company_id: 'c1' }), inactive: profile(db, 'sales', { is_active: false }) }
  db.seed('requirements', [
    { id: STAFF_REQ, name: 'Staff made', quantity: 10, budget: 500, status: 'active', workflow_stage: null },
    { id: FLOW_REQ, name: 'Awaiting review', quantity: 10, budget: 500, status: 'active', workflow_stage: 'submitted' },
    { id: SENT_REQ, name: 'Quoted', quantity: 10, budget: 500, status: 'quoted', workflow_stage: 'quotation_sent' },
  ])
  return { db, ids }
}
const row = (db: InstanceType<typeof FakeDb>, id: string) => db.rows('requirements').find((r) => r.id === id) as Record<string, unknown>
const edit = (id: string, over: Record<string, string> = {}) =>
  form({ id, name: 'Renamed', quantity: '10', budget: '500', status: 'active', ...over })

{
  const { db, ids } = world()
  signIn(db, ids.client)
  assert.ok(isError(await call(() => updateRequirementForm(edit(STAFF_REQ)))), 'a client cannot use the staff editor')
  signIn(db, ids.inactive)
  assert.ok(isError(await call(() => updateRequirementForm(edit(STAFF_REQ)))), 'a deactivated user cannot edit')
  signIn(db, null)
  assert.ok(isError(await call(() => updateRequirementForm(edit(STAFF_REQ)))))
  assert.equal(row(db, STAFF_REQ).name, 'Staff made')
  assert.equal(db.writes.length, 0)
}
{
  const { db, ids } = world()
  signIn(db, ids.sales)
  assert.ok(isSuccess(await call(() => updateRequirementForm(edit(STAFF_REQ, { budget: '800', status: 'won' })))))
  assert.equal(row(db, STAFF_REQ).budget, 800, 'a staff-made requirement is freely editable')
  assert.ok(isError(await call(() => updateRequirementForm(edit(STAFF_REQ, { status: 'hacked' })))), 'unknown status refused')
  assert.ok(isError(await call(() => updateRequirementForm(edit(STAFF_REQ, { name: ' ' })))), 'empty name refused')
  assert.ok(isError(await call(() => updateRequirementForm(edit('not-a-uuid')))))
}
{
  // client-workflow requirement: status follows the workflow
  const { db, ids } = world()
  signIn(db, ids.sales)
  assert.ok(isSuccess(await call(() => updateRequirementForm(edit(FLOW_REQ, { status: 'won' })))))
  assert.equal(row(db, FLOW_REQ).status, 'active', "staff cannot mark a client-workflow requirement 'won'")
  assert.equal(row(db, FLOW_REQ).workflow_stage, 'submitted', 'the workflow stage is never touched by the editor')
  assert.ok(isSuccess(await call(() => updateRequirementForm(edit(FLOW_REQ, { status: 'closed' })))))
  assert.equal(row(db, FLOW_REQ).status, 'closed', 'closing is allowed')
  // after approval the scope is frozen, but resaving the same numbers works
  assert.ok(isError(await call(() => updateRequirementForm(edit(SENT_REQ, { budget: '1' })))), 'budget frozen once quoted')
  assert.ok(isError(await call(() => updateRequirementForm(edit(SENT_REQ, { quantity: '99' })))), 'quantity frozen once quoted')
  assert.ok(isSuccess(await call(() => updateRequirementForm(edit(SENT_REQ, { status: 'draft' })))))
  assert.equal(row(db, SENT_REQ).status, 'quoted', "'draft' cannot rewind a quoted client requirement")
  assert.equal(row(db, SENT_REQ).workflow_stage, 'quotation_sent')
}

// ---- createQuotationFromRequirement: approval gate, role gate, and a missing migration 27 fails closed
{
  const quietErr = console.error
  console.error = () => undefined
  const stageCases: [string | null, boolean][] = [
    [null, true], ['submitted', false], ['changes_requested', false], ['admin_approved', false], ['client_confirmed', false],
    ['selection_submitted', false], ['selection_approved', true], ['quotation_rejected', true], ['quotation_accepted', false],
  ]
  for (const [stage, allowed] of stageCases) {
    const { db, ids } = world()
    db.rpcHandlers.next_quotation_number = () => ({ data: 'Q-1' })
    db.rpcHandlers.recalc_quotation_totals = () => ({ data: null })
    db.rows('requirements')[0].workflow_stage = stage
    signIn(db, ids.sales)
    const result = await call(() => createQuotationFromRequirement(form({ requirement_id: STAFF_REQ })))
    if (allowed) assert.ok(!isError(result) && db.rows('quotations').length === 1, `stage ${stage} may be quoted`)
    else assert.ok(isError(result) && db.rows('quotations').length === 0, `stage ${stage} must not be quoted`)
  }
  for (const who of ['client', 'inactive'] as const) {
    const { db, ids } = world()
    db.rpcHandlers.next_quotation_number = () => ({ data: 'Q-1' })
    signIn(db, ids[who])
    assert.ok(isError(await call(() => createQuotationFromRequirement(form({ requirement_id: STAFF_REQ })))), `${who} cannot create quotations`)
    assert.equal(db.rows('quotations').length, 0)
  }
  {
    // migration 27 not applied: the column is missing, the read fails, and nothing is created
    const { db, ids } = world()
    db.rpcHandlers.next_quotation_number = () => ({ data: 'Q-1' })
    db.readErrors['requirements'] = 'column requirements.workflow_stage does not exist'
    signIn(db, ids.sales)
    const result = await call(() => createQuotationFromRequirement(form({ requirement_id: STAFF_REQ })))
    assert.ok(isError(result) && /20261027/.test(result.error), 'a clear message names the missing migration')
    assert.equal(db.rows('quotations').length, 0, 'no quotation without being able to check the approval gate')
    assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name === 'next_quotation_number').length, 0, 'no quotation number is consumed')
  }
  console.error = quietErr
}
console.log('requirement action tests: all assertions passed')
