// Issues 1 and 3: the staff Requirements queue query, who-acts-next labelling, and sharing a staff-created
// requirement with the client. Isolated: a fake database, no network, no e-mail (the provider key is blanked first).
// Row-level security, the workflow guard trigger and PostgREST embedding are NOT exercised here; scripts/db-tests/05
// checks the real list query and the real workflow against Supabase.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.RESEND_API_KEY = ''
process.env.RESEND_FROM_EMAIL = ''

// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const { FakeDb, install, profile, signIn, call, isError, isSuccess, form } = await import('./stubs/harness.mts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const workflow = await import('../src/lib/requirements/workflow.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const list = await import('../src/lib/requirements/list.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const share = await import('../src/lib/requirements/share.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const actions = await import('../src/app/crm/requirements/actions.ts')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const quietErr = console.error
console.error = () => undefined

// ---- Issue 1: the list query must never embed profiles ambiguously -------------------------------------------
assert.match(list.REQUIREMENT_LIST_SELECT, /profiles!requirements_owner_id_fkey/, 'the owner embed names its foreign key')
assert.ok(!/(^|[^!\w])profiles\(/.test(list.REQUIREMENT_LIST_SELECT), 'no unqualified profiles(...) embed in the list select')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}
// requirements has 4+ foreign keys to profiles: any select on it that embeds profiles without naming the key is empty in production.
for (const file of sourceFiles(path.join(root, 'src'))) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/from\('requirements'\)\s*\.select\(\s*(['`])([^]*?)\1/g)) {
    assert.ok(!/(^|[^!\w])profiles\(/.test(match[2]), `${path.relative(root, file)}: requirements select embeds profiles without a foreign key name`)
  }
}
const listPage = readFileSync(path.join(root, 'src/app/crm/requirements/page.tsx'), 'utf8')
assert.ok(listPage.includes('REQUIREMENT_LIST_SELECT'), 'the admin list page uses the shared, qualified select')
assert.ok(/error\?\.message|error\.message/.test(listPage), 'the admin list page surfaces a failed query instead of showing an empty queue')

// ---- stage groups and who acts next ---------------------------------------------------------------------------
const finished = new Set(['admin_rejected', 'quotation_accepted'])
for (const stage of workflow.STAGE_KEYS as string[]) {
  const who = workflow.waitingOn(stage)
  if (finished.has(stage)) assert.equal(who, null, `${stage} is finished`)
  else assert.ok(who === 'client' || who === 'staff', `${stage} has an owner of the next step`)
}
assert.equal(workflow.waitingOn(null), null)
assert.equal(workflow.waitingOn('admin_approved'), 'client')
assert.equal(workflow.waitingOn('submitted'), 'staff')
assert.equal(workflow.waitingOn('quotation_sent'), 'client')
assert.equal(workflow.clientActionNeeded('client_confirmed'), true)
assert.equal(workflow.clientActionNeeded('selection_submitted'), false)
for (const stages of Object.values(list.STAGE_GROUPS) as string[][]) {
  for (const stage of stages) assert.ok((workflow.STAGE_KEYS as string[]).includes(stage), `${stage} is a real stage`)
}
assert.deepEqual([...list.STAGE_GROUPS.waiting_client].sort(), (workflow.STAGE_KEYS as string[]).filter((s) => workflow.waitingOn(s) === 'client').sort(), 'the "waiting on client" filter matches waitingOn()')
assert.ok(list.isStageGroup('needs_review') && !list.isStageGroup('submitted') && !list.isStageGroup('constructor'))

// ---- origin-aware wording: a staff-created requirement reads differently from a client submission -------------------
assert.equal(workflow.originFromCreationEvent('staff'), 'staff')
assert.equal(workflow.originFromCreationEvent('client'), 'client')
assert.equal(workflow.originFromCreationEvent(undefined), 'client')
assert.equal(workflow.staffStageLabel('admin_approved', 'staff'), 'Sent to client – awaiting response')
assert.equal(workflow.staffStageLabel('admin_approved', 'client'), 'Approved – awaiting client')
assert.equal(workflow.staffStageLabel('submitted', 'client'), 'Awaiting review')
assert.notEqual(workflow.staffStageLabel('submitted', 'staff'), workflow.staffStageLabel('submitted', 'client'))
assert.match(workflow.clientStageText('admin_approved', 'staff').label, /account manager/i)
assert.match(workflow.clientStageText('admin_approved', 'client').label, /confirm/i)
assert.equal(workflow.staffCanShareWithClient(null, 'active'), true)
assert.equal(workflow.staffCanShareWithClient('admin_approved', 'active'), false, 'already in the flow')
assert.equal(workflow.staffCanShareWithClient(null, 'closed'), false)
assert.equal(workflow.staffCanShareWithClient(null, 'won'), false)

// ---- Issue 3: sharing is atomic and idempotent --------------------------------------------------------------------
const REQ = '71000000-0000-4000-8000-000000000001'
const COMPANY = 'c1000000-0000-4000-8000-000000000001'
function world(over: Record<string, unknown> = {}, withClientUser = true) {
  const db = new FakeDb()
  install(db)
  const ids = {
    admin: profile(db, 'admin'),
    sales: profile(db, 'sales'),
    other: profile(db, 'sales'),
    client: withClientUser ? profile(db, 'client_admin', { company_id: COMPANY }) : null,
  }
  db.rpcHandlers.notify_users = () => ({ data: null })
  db.seed('requirements', [{ id: REQ, name: 'Diwali', company_id: COMPANY, owner_id: ids.sales, status: 'active', workflow_stage: null, ...over }])
  return { db, ids }
}
const stage = (db: InstanceType<typeof FakeDb>) => (db.rows('requirements').find((r) => r.id === REQ) as Record<string, unknown>).workflow_stage

{
  const { db, ids } = world()
  const first = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin, note: ' Please confirm by Friday ' })
  assert.deepEqual(first, { ok: true, alreadyShared: false })
  assert.equal(stage(db), 'admin_approved', 'the requirement enters the flow where the client portal offers Confirm / Request changes')
  const events = db.rows('requirement_events')
  assert.equal(events.length, 1, 'one history row')
  assert.equal(events[0].actor_kind, 'staff')
  assert.equal(events[0].from_stage, null)
  assert.equal(events[0].to_stage, 'admin_approved')
  assert.equal(events[0].visible_to_client, true)
  assert.equal(events[0].note, 'Please confirm by Friday')
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users').length, 1, 'one in-app notification')
  assert.equal(db.rpcCalls[0].args.p_company_id, COMPANY, 'the notification goes to the requirement’s own company')

  const again = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin })
  assert.deepEqual(again, { ok: true, alreadyShared: true })
  assert.equal(db.rows('requirement_events').length, 1, 'a second click writes no second history row')
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users').length, 1, 'and sends no second notification')
}
{
  const { db, ids } = world({ workflow_stage: 'submitted' })
  const result = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin })
  assert.deepEqual(result, { ok: true, alreadyShared: true }, 'a requirement already in the flow is left alone')
  assert.equal(stage(db), 'submitted')
  assert.equal(db.rows('requirement_events').length, 0)
}
for (const status of ['closed', 'won', 'lost']) {
  const { db, ids } = world({ status })
  const result = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin })
  assert.equal(result.ok, false, `a ${status} requirement cannot be shared`)
  assert.equal(stage(db), null)
}
{
  const { db, ids } = world({}, false)
  const result = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin })
  assert.equal(result.ok, false)
  assert.match(String(result.error), /no active client users/i, 'nobody could answer, so it is refused with a clear message')
  assert.equal(stage(db), null)
  assert.equal(db.rows('requirement_events').length, 0)
}
{
  const { db, ids } = world({ company_id: null })
  assert.equal((await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: ids.admin })).ok, false, 'no company, nothing to share with')
}
{
  const { db, ids } = world()
  assert.equal((await share.shareRequirementWithClient(db.client() as never, { requirementId: '72000000-0000-4000-8000-000000000009', actorId: ids.admin })).ok, false, 'unknown requirement')
}
{
  // a client user of ANOTHER company does not make the target company shareable
  const db = new FakeDb()
  install(db)
  const admin = profile(db, 'admin')
  profile(db, 'client_user', { company_id: 'c2000000-0000-4000-8000-000000000002' })
  profile(db, 'client_user', { company_id: COMPANY, is_active: false })
  db.seed('requirements', [{ id: REQ, name: 'X', company_id: COMPANY, owner_id: admin, status: 'active', workflow_stage: null }])
  const result = await share.shareRequirementWithClient(db.client() as never, { requirementId: REQ, actorId: admin })
  assert.equal(result.ok, false, 'other companies’ users and deactivated users do not count')
}

// ---- the staff actions: who may share, create-and-share, and no duplicate on retry ------------------------------------
{
  const { db, ids } = world()
  signIn(db, ids.client)
  assert.ok(isError(await call(() => actions.shareRequirementWithClient(REQ, ''))), 'a client cannot use the staff action')
  signIn(db, ids.other)
  assert.ok(isError(await call(() => actions.shareRequirementWithClient(REQ, ''))), 'a salesperson cannot share somebody else’s requirement')
  signIn(db, null)
  assert.ok(isError(await call(() => actions.shareRequirementWithClient(REQ, ''))))
  assert.equal(stage(db), null)
  assert.ok(isError(await call(() => actions.shareRequirementWithClient('not-a-uuid', ''))))

  signIn(db, ids.sales)
  assert.ok(isSuccess(await call(() => actions.shareRequirementWithClient(REQ, 'hello'))), 'the owner can share')
  assert.equal(stage(db), 'admin_approved')
  assert.ok(isSuccess(await call(() => actions.shareRequirementWithClient(REQ, 'hello'))), 'repeating it is harmless')
  assert.equal(db.rows('requirement_events').length, 1)
}
{
  const { db, ids } = world()
  db.tables.requirements = []
  signIn(db, ids.admin)
  const fields = { name: 'Year-end', company_id: COMPANY, quantity: '50', budget: '1200', share_with_client: 'on', client_note: 'See attached brief' }
  const created = await call(() => actions.createRequirement(form(fields)))
  assert.ok('redirected' in created && /\/crm\/requirements\//.test(created.redirected), 'redirects to the new requirement')
  const rows = db.rows('requirements')
  assert.equal(rows.length, 1, 'exactly one requirement is created')
  assert.equal(rows[0].workflow_stage, 'admin_approved', 'created and shared in one step')
  assert.equal(rows[0].company_id, COMPANY)
  assert.equal(db.rows('requirement_events').length, 1)
}
{
  const { db, ids } = world({}, false)
  db.tables.requirements = []
  signIn(db, ids.admin)
  const refused = await call(() => actions.createRequirement(form({ name: 'No users', company_id: COMPANY, share_with_client: 'on' })))
  assert.ok(isError(refused) && /no active client users/i.test(refused.error), 'sharing with a company that has no client users is refused before anything is created')
  assert.equal(db.rows('requirements').length, 0, 'nothing was created')
  const internal = await call(() => actions.createRequirement(form({ name: 'Internal only', company_id: COMPANY })))
  assert.ok('redirected' in internal, 'without the tick it is created as before')
  assert.equal(db.rows('requirements')[0].workflow_stage ?? null, null, 'an internal requirement stays outside the client flow')
  assert.equal(db.rows('requirement_events').length, 0)
}

console.error = quietErr
console.log('requirement sharing and queue tests: all assertions passed')
