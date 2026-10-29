// Issue 4: a client's response to a catalogue (selection + comments) is validated, stored once per company, never
// changes the assigned catalogue, and staff can turn it into ONE requirement. Isolated fake database: row-level
// security and the real unique index are NOT exercised here; scripts/db-tests/06 checks them against Supabase.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.RESEND_API_KEY = ''
process.env.RESEND_FROM_EMAIL = ''

// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const { FakeDb, install, profile, signIn, call, isError, isSuccess } = await import('./stubs/harness.mts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const lib = await import('../src/lib/catalogues/responses.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const portal = await import('../src/app/portal/catalogues/actions.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const staff = await import('../src/app/crm/products/catalogues/responses/actions.ts')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const quietErr = console.error
console.error = () => undefined

const CAMPAIGN = 'a1000000-0000-4000-8000-000000000001'
const OTHER_CAMPAIGN = 'a1000000-0000-4000-8000-000000000002'
const COMPANY = 'c1000000-0000-4000-8000-0000000000a1'
const OFFER_1 = 'b1000000-0000-4000-8000-000000000001'
const OFFER_2 = 'b1000000-0000-4000-8000-000000000002'
const OFFER_FOREIGN = 'b1000000-0000-4000-8000-000000000003'
const PROD_1 = 'd1000000-0000-4000-8000-000000000001'
const PROD_2 = 'd1000000-0000-4000-8000-000000000002'

const offerings = [
  { id: OFFER_1, product_id: PROD_1, display_name: 'Steel Bottle', selling_price: 450, moq: 10 },
  { id: OFFER_2, product_id: PROD_2, display_name: 'Desk Diary', selling_price: '95.00', moq: 1 },
]

// ---- pure validation ------------------------------------------------------------------------------------------------
{
  const ok = lib.buildResponseItems([{ campaign_product_id: OFFER_1, quantity: '25', notes: '  Navy  blue ' }], offerings)
  assert.ok(ok.ok)
  assert.deepEqual(ok.items, [{ campaign_product_id: OFFER_1, product_id: PROD_1, name: 'Steel Bottle', quantity: 25, notes: 'Navy blue', unit_price: 450 }])

  // a price (or any other field) from the browser is ignored: the stored price comes from the offering
  const tampered = lib.buildResponseItems([{ campaign_product_id: OFFER_2, quantity: 3, unit_price: 1, price: 1, name: 'Hacked' } as never], offerings)
  assert.ok(tampered.ok)
  assert.equal(tampered.items[0].unit_price, 95)
  assert.equal(tampered.items[0].name, 'Desk Diary')

  const merged = lib.buildResponseItems(
    [
      { campaign_product_id: OFFER_2, quantity: 2, notes: 'a' },
      { campaign_product_id: OFFER_2, quantity: 3 },
    ],
    offerings,
  )
  assert.ok(merged.ok && merged.items.length === 1 && merged.items[0].quantity === 5 && merged.items[0].notes === 'a', 'the same gift twice becomes one line')

  const bad = (items: unknown) => lib.buildResponseItems(items, offerings)
  assert.equal(bad([{ campaign_product_id: 'nope', quantity: 1 }]).ok, false, 'malformed id')
  assert.equal(bad([{ campaign_product_id: OFFER_FOREIGN, quantity: 1 }]).ok, false, 'an offering this company cannot see (not in its list) is refused')
  for (const quantity of [0, -1, 1.5, 'abc', '', 1_000_001]) {
    assert.equal(bad([{ campaign_product_id: OFFER_2, quantity }]).ok, false, `quantity ${String(quantity)} refused`)
  }
  assert.equal(bad([{ campaign_product_id: OFFER_1, quantity: 5 }]).ok, false, 'below the MOQ of 10')
  assert.ok(bad([{ campaign_product_id: OFFER_1, quantity: 10 }]).ok, 'exactly the MOQ is fine')
  const many = Array.from({ length: 201 }, () => ({ campaign_product_id: OFFER_2, quantity: 1 }))
  assert.equal(bad(many).ok, false, 'more than 200 lines refused')
  assert.ok(bad([]).ok && bad(undefined).ok && bad('x').ok, 'no items is valid on its own (a comment-only response)')

  const a = { items: [{ campaign_product_id: OFFER_1, quantity: 10, notes: null }, { campaign_product_id: OFFER_2, quantity: 1, notes: 'x' }], comment: 'hi' }
  const b = { items: [{ campaign_product_id: OFFER_2, quantity: 1, notes: 'x' }, { campaign_product_id: OFFER_1, quantity: 10, notes: null }], comment: 'hi' }
  assert.ok(lib.sameResponse(a, b), 'order does not matter')
  assert.ok(!lib.sameResponse(a, { ...b, comment: 'hello' }))
  assert.ok(!lib.sameResponse(a, { ...b, items: [{ ...b.items[0], quantity: 2 }, b.items[1]] }))
  assert.equal(lib.responseSummary({ status: 'submitted', items: [{}, {}] }), 'Response received – 2 products')
  assert.equal(lib.responseSummary({ status: 'submitted', items: [] }), 'Response received – comments only')
  assert.match(lib.responseSummary({ status: 'processed', items: [], requirement_id: 'r' }), /requirement created/)
  assert.equal(lib.isMissingTable({ code: 'PGRST205', message: 'x' }), true)
  assert.equal(lib.isMissingTable({ code: '42P01', message: 'x' }), true)
  assert.equal(lib.isMissingTable({ message: 'relation "public.catalogue_responses" does not exist' }), true)
  assert.equal(lib.isMissingTable({ message: 'permission denied' }), false)
  assert.equal(lib.isMissingTable(null), false)
}

// ---- the stored response: one open row per catalogue and company -----------------------------------------------------
const items1 = [{ campaign_product_id: OFFER_1, product_id: PROD_1, name: 'Steel Bottle', quantity: 10, notes: null, unit_price: 450 }]
const base = { campaignId: CAMPAIGN, companyId: COMPANY, userId: 'u1', items: items1, comment: null as string | null }
{
  const db = new FakeDb()
  const first = await lib.saveOpenResponse(db.client() as never, base)
  assert.ok(first.ok && !first.unchanged && first.revision === 1)
  assert.equal(db.rows('catalogue_responses').length, 1)

  const same = await lib.saveOpenResponse(db.client() as never, base)
  assert.ok(same.ok && same.unchanged && same.id === first.id, 'an identical resubmission is a no-op')
  assert.equal(db.rows('catalogue_responses').length, 1)
  assert.equal(db.writes.filter((w: string) => w.startsWith('catalogue_responses')).length, 1, 'and writes nothing')

  const changed = await lib.saveOpenResponse(db.client() as never, { ...base, comment: 'Please add a red option' })
  assert.ok(changed.ok && !changed.unchanged && changed.revision === 2 && changed.id === first.id, 'a changed answer updates the same row')
  assert.equal(db.rows('catalogue_responses').length, 1, 'still one row')
  assert.equal(db.rows('catalogue_responses')[0].comment, 'Please add a red option')

  // staff processed it: the client's next answer starts a NEW response and the processed one is untouched
  db.rows('catalogue_responses')[0].status = 'processed'
  const next = await lib.saveOpenResponse(db.client() as never, { ...base, comment: 'One more thing' })
  assert.ok(next.ok && next.id !== first.id && next.revision === 1)
  assert.equal(db.rows('catalogue_responses').length, 2)
  assert.equal(db.rows('catalogue_responses').filter((r: Record<string, unknown>) => r.status === 'submitted').length, 1)

  // another company's open response is a different row
  const other = await lib.saveOpenResponse(db.client() as never, { ...base, companyId: 'c2000000-0000-4000-8000-0000000000b2' })
  assert.ok(other.ok && other.id !== next.id)
}
{
  // a missing table (migration not applied) gives the clear message, not a crash
  const db = new FakeDb()
  db.readErrors['catalogue_responses'] = 'relation "public.catalogue_responses" does not exist'
  const result = await lib.saveOpenResponse(db.client() as never, base)
  assert.ok(!result.ok && /20261041/.test(result.error))
}
{
  // lost a race to an identical first submission (unique violation): the winner's row is updated instead of a second row
  const db = new FakeDb()
  const real = db.client()
  let raced = false
  const racing = {
    ...real,
    from(table: string) {
      const query = real.from(table) as unknown as Record<string, unknown>
      if (table !== 'catalogue_responses') return query
      const insert = query.insert as (rows: unknown) => unknown
      query.insert = (rows: unknown) => {
        if (raced) return insert.call(query, rows)
        raced = true
        // an identical first submission from the same company lands just before ours, so ours hits the unique index
        db.seed('catalogue_responses', [{ campaign_id: CAMPAIGN, company_id: COMPANY, status: 'submitted', items: [], comment: null, revision: 1 }])
        return { select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }
      }
      return query
    },
  }
  const result = await lib.saveOpenResponse(racing as never, base)
  assert.ok(result.ok, 'the race resolves')
  assert.equal(db.rows('catalogue_responses').length, 1, 'no duplicate row after a lost race')
  assert.equal(db.rows('catalogue_responses')[0].revision, 2, 'the winner’s row was updated with this answer')
}

// ---- the client action ---------------------------------------------------------------------------------------------
function portalWorld() {
  const db = new FakeDb()
  install(db)
  const ids = {
    client: profile(db, 'client_admin', { company_id: COMPANY, full_name: 'Client A' }),
    sales: profile(db, 'sales'),
    inactive: profile(db, 'client_user', { company_id: COMPANY, is_active: false }),
  }
  db.rpcHandlers.client_company_id = () => ({ data: COMPANY })
  db.rpcHandlers.notify_users = () => ({ data: null })
  db.seed('companies', [{ id: COMPANY, name: 'Acme' }])
  db.seed('campaigns', [{ id: CAMPAIGN, name: 'Diwali 2026' }, { id: OTHER_CAMPAIGN, name: 'Hidden' }])
  db.seed('campaign_products', [
    { id: OFFER_1, campaign_id: CAMPAIGN, product_id: PROD_1, display_name: 'Steel Bottle', selling_price: 450, moq: 10, visibility: 'published' },
    { id: OFFER_2, campaign_id: CAMPAIGN, product_id: PROD_2, display_name: 'Desk Diary', selling_price: 95, moq: 1, visibility: 'published' },
    { id: OFFER_FOREIGN, campaign_id: OTHER_CAMPAIGN, product_id: PROD_2, display_name: 'Other catalogue gift', selling_price: 10, moq: 1, visibility: 'published' },
  ])
  return { db, ids }
}
const notifications = (db: InstanceType<typeof FakeDb>) => db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users')
{
  const { db, ids } = portalWorld()
  const pick = [{ campaign_product_id: OFFER_1, quantity: '20', notes: 'engrave later' }]

  signIn(db, null)
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, pick, ''))), 'signed out')
  signIn(db, ids.sales)
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, pick, ''))), 'staff use the staff side')
  signIn(db, ids.inactive)
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, pick, ''))), 'a deactivated client')
  assert.equal(db.rows('catalogue_responses').length, 0)

  signIn(db, ids.client)
  assert.ok(isError(await call(() => portal.submitCatalogueResponse('not-a-uuid', pick, ''))))
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, [], '   '))), 'nothing selected and no comment')
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, [{ campaign_product_id: OFFER_FOREIGN, quantity: 1 }], ''))), 'an offering from another catalogue')
  assert.ok(isError(await call(() => portal.submitCatalogueResponse(CAMPAIGN, [{ campaign_product_id: OFFER_1, quantity: 3 }], ''))), 'below MOQ')
  assert.equal(db.rows('catalogue_responses').length, 0, 'every refusal wrote nothing')

  const first = await call(() => portal.submitCatalogueResponse(CAMPAIGN, pick, ' Please add a green one '))
  assert.ok(isSuccess(first))
  const rows = db.rows('catalogue_responses')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].company_id, COMPANY, 'the company comes from the session')
  assert.equal(rows[0].submitted_by, ids.client)
  assert.equal(rows[0].status, 'submitted')
  assert.equal(rows[0].comment, 'Please add a green one')
  assert.equal((rows[0].items as unknown[]).length, 1)
  assert.equal(notifications(db).length, 1, 'staff are told once')
  assert.equal(notifications(db)[0].args.p_audience, 'internal')
  assert.equal(db.rows('campaign_products').length, 3, 'the assigned catalogue is untouched')
  assert.equal(db.writes.filter((w: string) => w.startsWith('campaign_products')).length, 0)

  const again = await call(() => portal.submitCatalogueResponse(CAMPAIGN, pick, 'Please add a green one'))
  assert.ok(isSuccess(again) && (again as { unchanged?: boolean }).unchanged === true, 'an identical resend is a no-op')
  assert.equal(db.rows('catalogue_responses').length, 1)
  assert.equal(notifications(db).length, 1, 'and does not notify again')

  const edited = await call(() => portal.submitCatalogueResponse(CAMPAIGN, [...pick, { campaign_product_id: OFFER_2, quantity: 5 }], 'Please add a green one'))
  assert.ok(isSuccess(edited) && /updated/i.test((edited as { message: string }).message))
  assert.equal(db.rows('catalogue_responses').length, 1, 'still one open response')
  assert.equal(db.rows('catalogue_responses')[0].revision, 2)
  assert.equal(notifications(db).length, 2)

  const commentOnly = await call(() => portal.submitCatalogueResponse(CAMPAIGN, [], 'We would like a different colour palette.'))
  assert.ok(isSuccess(commentOnly), 'comments only is a valid response')
  assert.equal((db.rows('catalogue_responses')[0].items as unknown[]).length, 0)
}
{
  // migration not applied: a clear message for the client, nothing crashes
  const { db, ids } = portalWorld()
  signIn(db, ids.client)
  db.readErrors['catalogue_responses'] = 'relation "public.catalogue_responses" does not exist'
  const result = await call(() => portal.submitCatalogueResponse(CAMPAIGN, [{ campaign_product_id: OFFER_2, quantity: 1 }], ''))
  assert.ok(isError(result) && /20261041/.test(result.error))
}

// ---- the staff actions --------------------------------------------------------------------------------------------
function staffWorld(over: Record<string, unknown> = {}) {
  const db = new FakeDb()
  install(db)
  const ids = { admin: profile(db, 'admin'), sales: profile(db, 'sales'), ops: profile(db, 'operations'), client: profile(db, 'client_admin', { company_id: COMPANY }) }
  db.rpcHandlers.notify_users = () => ({ data: null })
  db.seed('companies', [{ id: COMPANY, name: 'Acme', owner_id: ids.sales }])
  db.seed('campaigns', [{ id: CAMPAIGN, name: 'Diwali 2026', occasion: 'festival' }])
  db.seed('products', [{ id: PROD_1, name: 'Steel Bottle' }, { id: PROD_2, name: 'Desk Diary' }])
  db.seed('catalogue_responses', [
    {
      id: 'e1000000-0000-4000-8000-000000000001',
      campaign_id: CAMPAIGN,
      company_id: COMPANY,
      status: 'submitted',
      comment: 'Need these by December',
      revision: 1,
      requirement_id: null,
      items: [
        { campaign_product_id: OFFER_1, product_id: PROD_1, name: 'Steel Bottle', quantity: 20, notes: 'Navy', unit_price: 450 },
        { campaign_product_id: OFFER_2, product_id: PROD_2, name: 'Desk Diary', quantity: 5, notes: null, unit_price: 95 },
      ],
      ...over,
    },
  ])
  return { db, ids, responseId: 'e1000000-0000-4000-8000-000000000001' }
}
{
  const { db, ids, responseId } = staffWorld()
  signIn(db, ids.client)
  assert.ok(isError(await call(() => staff.createRequirementFromCatalogueResponse(responseId, true))), 'a client cannot')
  signIn(db, ids.ops)
  assert.ok(isError(await call(() => staff.createRequirementFromCatalogueResponse(responseId, true))), 'operations can view but not act')
  signIn(db, null)
  assert.ok(isError(await call(() => staff.markCatalogueResponseProcessed(responseId))))
  assert.equal(db.rows('requirements').length, 0)
  assert.equal(db.rows('catalogue_responses')[0].status, 'submitted')

  signIn(db, ids.admin)
  assert.ok(isError(await call(() => staff.createRequirementFromCatalogueResponse('nope', true))))
  const made = await call(() => staff.createRequirementFromCatalogueResponse(responseId, true))
  assert.ok(isSuccess(made) && /sent to the client/i.test((made as { message: string }).message), JSON.stringify(made))
  const requirements = db.rows('requirements')
  assert.equal(requirements.length, 1, 'exactly one requirement')
  assert.equal(requirements[0].company_id, COMPANY, 'for the right company')
  assert.equal(requirements[0].owner_id, ids.sales, 'owned by the company’s account manager')
  assert.equal(requirements[0].quantity, 25)
  assert.equal(requirements[0].workflow_stage, 'admin_approved', 'shared with the client through the normal approval flow')
  const lines = db.rows('requirement_products')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map((l: Record<string, unknown>) => [l.product_id, l.quantity, l.unit_price_snapshot]).sort(), [[PROD_1, 20, 450], [PROD_2, 5, 95]].sort(), 'the products, quantities and catalogue prices the client chose')
  assert.ok(String(lines.find((l: Record<string, unknown>) => l.product_id === PROD_1)?.notes).includes('Navy'))
  const response = db.rows('catalogue_responses')[0]
  assert.equal(response.status, 'processed')
  assert.equal(response.requirement_id, requirements[0].id)
  assert.equal(response.processed_by, ids.admin)

  const again = await call(() => staff.createRequirementFromCatalogueResponse(responseId, true))
  assert.ok(isSuccess(again) && (again as { requirementId?: string }).requirementId === requirements[0].id, 'repeating it returns the same requirement')
  assert.equal(db.rows('requirements').length, 1, 'no duplicate requirement')
  assert.equal(db.rows('requirement_products').length, 2, 'no duplicate lines')
}
{
  // the requirement exists but the link was lost (a crash): the same submission key is reused, not duplicated
  const { db, ids, responseId } = staffWorld()
  db.seed('requirements', [{ id: 'f1000000-0000-4000-8000-000000000001', company_id: COMPANY, name: 'x', submission_key: `catresp-${responseId}` }])
  signIn(db, ids.sales)
  const result = await call(() => staff.createRequirementFromCatalogueResponse(responseId, false))
  assert.ok(isSuccess(result))
  assert.equal(db.rows('requirements').length, 1)
  assert.equal(db.rows('catalogue_responses')[0].requirement_id, 'f1000000-0000-4000-8000-000000000001')
  assert.equal(db.rows('requirements')[0].workflow_stage ?? null, null, 'not shared when staff untick it')
}
{
  const { db, ids, responseId } = staffWorld({ items: [] })
  signIn(db, ids.admin)
  const refused = await call(() => staff.createRequirementFromCatalogueResponse(responseId, true))
  assert.ok(isError(refused) && /no products/i.test(refused.error), 'a comments-only response has nothing to turn into a requirement')
  assert.equal(db.rows('requirements').length, 0)
  const processed = await call(() => staff.markCatalogueResponseProcessed(responseId))
  assert.ok(isSuccess(processed))
  assert.equal(db.rows('catalogue_responses')[0].status, 'processed')
  const twice = await call(() => staff.markCatalogueResponseProcessed(responseId))
  assert.ok(isSuccess(twice))
  assert.equal(db.rpcCalls.filter((c: { name: string }) => c.name === 'notify_users').length, 1, 'the client is told once')
}

// ---- security shape of the migration and the pages ------------------------------------------------------------------
const migration = readFileSync(path.join(root, 'supabase/migrations/20261041_catalogue_responses.sql'), 'utf8')
assert.match(migration, /enable row level security/i)
assert.match(migration, /client_company_id\(\)/, 'a client reads only their own company')
assert.ok(!/for (insert|update|delete|all)\b/i.test(migration), 'no write policy for any API role')
assert.match(migration, /revoke insert, update, delete/i)
assert.match(migration, /create unique index if not exists catalogue_responses_one_open/i, 'one open response per catalogue and company')
for (const forbidden of ['supplier_cost', 'margin', 'cost_price']) {
  assert.ok(!migration.includes(forbidden), `no ${forbidden} in the response table`)
}
const portalPage = readFileSync(path.join(root, 'src/app/portal/catalogues/[id]/page.tsx'), 'utf8')
assert.ok(!/supplier|cost/i.test(portalPage.replace(/costs?-free/gi, '')), 'the client page never selects supplier or cost columns')

console.error = quietErr
console.log('catalogue response tests: all assertions passed')
