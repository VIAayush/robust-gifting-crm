// Catalogue page -> samples / requirement: the quantities and notes the client chose carry into the shortlist and the
// requirement form (scoped to this request), sample requests are created once per gift, and a client's note travels to
// the quotation line and the order. Isolated fake database; row-level security is NOT exercised here.
import assert from 'node:assert/strict'

process.env.RESEND_API_KEY = ''
process.env.RESEND_FROM_EMAIL = ''

// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const { FakeDb, install, profile, signIn, call, isError, isSuccess, form } = await import('./stubs/harness.mts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const portal = await import('../src/app/portal/catalogues/actions.ts')
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const notes = await import('../src/lib/orders/item-notes.ts')

const quietErr = console.error
console.error = () => undefined

// ---- note helpers -----------------------------------------------------------------------------------------------------------------
assert.equal(notes.composeItemDescription('Steel Bottle', ' Logo   on the lid '), 'Steel Bottle — Logo on the lid')
assert.equal(notes.composeItemDescription('Steel Bottle', ''), 'Steel Bottle')
assert.equal(notes.composeItemDescription('', 'only a note'), 'only a note')
assert.equal(notes.itemNote('Steel Bottle — Logo on the lid', 'Steel Bottle'), 'Logo on the lid')
assert.equal(notes.itemNote('Steel Bottle', 'Steel Bottle'), null, 'a description that is just the name has no note')
assert.equal(notes.itemNote('Something else', 'Steel Bottle'), null)
assert.equal(notes.itemNote(null, 'Steel Bottle'), null)
assert.equal(notes.itemNote('Steel Bottle — Colour: Red — Logo', 'Steel Bottle'), 'Colour: Red — Logo')
assert.equal(notes.clientLineNote('Client note: Logo on lid · Colours: Red × 5 · Catalogue: Diwali at ₹500'), 'Logo on lid · Colours: Red × 5', 'catalogue pricing context is not a client note')
assert.equal(notes.clientLineNote('Catalogue: Diwali at ₹500'), null)
assert.equal(notes.clientLineNote(null), null)
assert.equal(notes.clientLineNote(''), null)

// ---- the catalogue page actions -------------------------------------------------------------------------------------------------------
const CAMPAIGN = 'a1000000-0000-4000-8000-000000000001'
const OTHER = 'a1000000-0000-4000-8000-000000000002'
const COMPANY = 'c1000000-0000-4000-8000-0000000000a1'
const O1 = 'b1000000-0000-4000-8000-000000000001'
const O2 = 'b1000000-0000-4000-8000-000000000002'
const O3 = 'b1000000-0000-4000-8000-000000000003'
const OFOREIGN = 'b1000000-0000-4000-8000-000000000009'
const P1 = 'd1000000-0000-4000-8000-000000000001'
const P2 = 'd1000000-0000-4000-8000-000000000002'
const P3 = 'd1000000-0000-4000-8000-000000000003'
const POLD = 'd1000000-0000-4000-8000-000000000099'

function world() {
  const db = new FakeDb()
  install(db)
  const ids = { client: profile(db, 'client_admin', { company_id: COMPANY }), colleague: profile(db, 'client_user', { company_id: COMPANY }), sales: profile(db, 'sales') }
  db.rpcHandlers.client_company_id = () => ({ data: COMPANY })
  db.seed('campaigns', [{ id: CAMPAIGN, name: 'New Test' }, { id: OTHER, name: 'Hidden' }])
  db.seed('campaign_products', [
    { id: O1, campaign_id: CAMPAIGN, product_id: P1, display_name: 'RG-K318', selling_price: 786, moq: 50, visibility: 'published' },
    { id: O2, campaign_id: CAMPAIGN, product_id: P2, display_name: 'RG-K319', selling_price: 520, moq: 50, visibility: 'published' },
    { id: O3, campaign_id: CAMPAIGN, product_id: P3, display_name: 'RG-K320', selling_price: 600, moq: 1, visibility: 'published' },
    { id: OFOREIGN, campaign_id: OTHER, product_id: P3, display_name: 'Foreign', selling_price: 1, moq: 1, visibility: 'published' },
  ])
  // an OLD shortlist item that is not part of this request
  db.seed('company_product_interests', [{ id: 'f1', company_id: COMPANY, user_id: ids.client, product_id: POLD, variant_id: null, quantity: 1, notes: null }])
  return { db, ids }
}
const request = (selection: unknown[]) => form({ campaign_id: CAMPAIGN, selection: JSON.stringify(selection) })
const interest = (db: InstanceType<typeof FakeDb>, productId: string) => db.rows('company_product_interests').find((r: Record<string, unknown>) => r.product_id === productId) as Record<string, unknown> | undefined

{
  const { db, ids } = world()
  signIn(db, ids.client)
  const done = await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O1, quantity: 50, notes: 'Logo on the lid' }, { offering_id: O2, quantity: 60 }])))
  assert.ok('redirected' in done, JSON.stringify(done))
  const target = decodeURIComponent(done.redirected)
  assert.ok(target.includes(`/portal/requirements/new?catalogue=${CAMPAIGN}`), 'opens the requirement form for this catalogue')
  assert.ok(target.includes(`offerings=${O1},${O2}`) && !target.includes(O3), 'scoped to the gifts chosen in this request')
  assert.equal(interest(db, P1)?.quantity, 50, 'the quantity chosen on the catalogue page reaches the shortlist (it used to be 1)')
  assert.equal(interest(db, P1)?.notes, 'Logo on the lid', 'and so does the note')
  assert.equal(interest(db, P2)?.quantity, 60)
  assert.equal(interest(db, P3), undefined, 'a gift that was not ticked is not added')
  assert.equal(interest(db, POLD)?.quantity, 1, 'the older shortlist item is untouched (the form is scoped away from it, not edited)')

  // choosing again updates the existing rows instead of keeping the old quantity or adding duplicates
  const again = await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O1, quantity: 80, notes: 'New note' }])))
  assert.ok('redirected' in again)
  assert.equal(db.rows('company_product_interests').filter((r: Record<string, unknown>) => r.product_id === P1).length, 1, 'no duplicate shortlist row')
  assert.equal(interest(db, P1)?.quantity, 80)
  assert.equal(interest(db, P1)?.notes, 'New note')
  assert.equal(interest(db, P2)?.quantity, 60, 'a gift left out of the second request keeps its row')
}
{
  const { db, ids } = world()
  signIn(db, ids.client)
  assert.ok(isError(await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O1, quantity: 10 }])))), 'below the MOQ of 50')
  assert.ok(isError(await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O3, quantity: 0 }])))), 'zero')
  assert.ok(isError(await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O3, quantity: 'abc' }])))))
  assert.equal(db.rows('company_product_interests').length, 1, 'refusals wrote nothing')
  // a different catalogue's offering id in the selection is ignored, not shortlisted
  const foreign = await call(() => portal.requestCatalogueQuotation(request([{ offering_id: OFOREIGN, quantity: 5 }])))
  assert.ok('redirected' in foreign || isError(foreign))
  assert.equal(interest(db, P3), undefined, 'an offering from another catalogue never reaches the shortlist')
  // nothing ticked: the whole catalogue goes in at its MOQ
  const all = await call(() => portal.requestCatalogueQuotation(form({ campaign_id: CAMPAIGN })))
  assert.ok('redirected' in all)
  assert.equal(interest(db, P1)?.quantity, 50)
  assert.equal(interest(db, P3)?.quantity, 1)
}
{
  // a colleague's shortlist row is not rewritten by someone else
  const { db, ids } = world()
  db.seed('company_product_interests', [{ id: 'f2', company_id: COMPANY, user_id: ids.colleague, product_id: P2, variant_id: null, quantity: 7, notes: 'colleague' }])
  signIn(db, ids.client)
  await call(() => portal.requestCatalogueQuotation(request([{ offering_id: O2, quantity: 90 }])))
  assert.equal(interest(db, P2)?.quantity, 7, 'only the caller’s own rows are changed')
}

// ---- samples ----------------------------------------------------------------------------------------------------------------------------
{
  const { db, ids } = world()
  signIn(db, null)
  assert.ok(isError(await call(() => portal.requestCatalogueSamples(CAMPAIGN, [O1], ''))))
  signIn(db, ids.sales)
  assert.ok(isError(await call(() => portal.requestCatalogueSamples(CAMPAIGN, [O1], ''))), 'staff do not request samples this way')
  signIn(db, ids.client)
  assert.ok(isError(await call(() => portal.requestCatalogueSamples('bad', [O1], ''))))
  assert.ok(isError(await call(() => portal.requestCatalogueSamples(CAMPAIGN, [], ''))), 'nothing ticked')
  assert.ok(isError(await call(() => portal.requestCatalogueSamples(CAMPAIGN, [OFOREIGN], ''))), 'an offering from another catalogue')
  assert.equal(db.rows('sample_requests').length, 0)

  const first = await call(() => portal.requestCatalogueSamples(CAMPAIGN, [O1, O2], ' Send to Pune '))
  assert.ok(isSuccess(first) && /2 gifts/.test((first as { message: string }).message), JSON.stringify(first))
  const rows = db.rows('sample_requests')
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r: Record<string, unknown>) => r.company_id === COMPANY && r.requested_by === ids.client && r.quantity === 1 && r.status === 'pending'))
  assert.ok(String(rows[0].notes).includes('New Test') && String(rows[0].notes).includes('Send to Pune'))

  const repeat = await call(() => portal.requestCatalogueSamples(CAMPAIGN, [O1, O2], ''))
  assert.ok(isSuccess(repeat) && /already/i.test((repeat as { message: string }).message))
  assert.equal(db.rows('sample_requests').length, 2, 'pressing the button twice creates no duplicates')

  const partial = await call(() => portal.requestCatalogueSamples(CAMPAIGN, [O2, O3], ''))
  assert.ok(isSuccess(partial) && /1 already/.test((partial as { message: string }).message))
  assert.equal(db.rows('sample_requests').length, 3, 'only the new gift is added')
}

console.error = quietErr
console.log('catalogue selection flow tests: all assertions passed')
