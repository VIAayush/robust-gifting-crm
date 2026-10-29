// Live check for Issue 4 (needs migration 20261041_catalogue_responses.sql): row-level security, uniqueness and write
// protection of catalogue_responses, with REAL signed-in sessions. Creates ZZ-QA fixtures, removes them in a finally
// block, sends no e-mail.   node --env-file=.env scripts/db-tests/06-catalogue-responses.mjs
import { Checks, anonClient, createFixtures, serviceClient, sessionFor } from './_fixtures.mjs'

const service = serviceClient()
const probe = await service.from('catalogue_responses').select('id').limit(1)
async function run() {
const checks = new Checks()
const { fx, cleanup } = await createFixtures(service)
let exitCode = 0
try {
  const admin = await sessionFor(fx.users.admin)
  const sales = await sessionFor(fx.users.sales)
  const clientA = await sessionFor(fx.users.clientA)
  const clientB = await sessionFor(fx.users.clientB)

  const { data: campaign, error: campaignError } = await service
    .from('campaigns')
    .insert({ name: `ZZ-QA catalogue ${fx.tag}`, owner_id: fx.users.admin.id, published_to_client_at: new Date().toISOString() })
    .select('id')
    .single()
  if (campaignError) throw new Error(campaignError.message)
  fx.extra.campaigns.push(campaign.id)
  await service.from('campaign_companies').insert([
    { campaign_id: campaign.id, company_id: fx.companies.A },
    { campaign_id: campaign.id, company_id: fx.companies.B },
  ])
  const item = { campaign_product_id: '00000000-0000-4000-8000-000000000001', product_id: '00000000-0000-4000-8000-000000000002', name: 'Test gift', quantity: 3, notes: 'secret-A-note', unit_price: 100 }
  const base = { campaign_id: campaign.id, submitted_by: fx.users.clientA.id, items: [item], comment: 'A comment from company A' }

  // Uniqueness: one open response per catalogue and company.
  const first = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.A }).select('id').single()
  checks.check('an open response can be stored', !first.error, first.error?.message)
  const duplicate = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.A })
  checks.check('a second OPEN response for the same catalogue and company is rejected (23505)', duplicate.error?.code === '23505', duplicate.error?.code)
  const other = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.B, submitted_by: fx.users.clientB.id, comment: 'B comment', items: [{ ...item, notes: 'secret-B-note' }] }).select('id').single()
  checks.check('another company can respond to the same catalogue', !other.error, other.error?.message)
  const processed = await service.from('catalogue_responses').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', first.data.id)
  checks.check('a response can be marked processed', !processed.error, processed.error?.message)
  const again = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.A, comment: 'a later round' }).select('id').single()
  checks.check('after processing, the same company can open a new response', !again.error, again.error?.message)
  fx.extra.catalogueResponses.push(first.data.id, other.data.id, again.data?.id)

  // Constraints.
  const badStatus = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.B, status: 'approved' })
  checks.check('an unknown status is rejected', Boolean(badStatus.error))
  const badItems = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.B, items: { not: 'an array' }, status: 'processed' })
  checks.check('items must be a JSON array', Boolean(badItems.error))
  const longComment = await service.from('catalogue_responses').insert({ ...base, company_id: fx.companies.B, comment: 'x'.repeat(2001), status: 'processed' })
  checks.check('a comment over 2000 characters is rejected', Boolean(longComment.error))

  // Requirement link: a requirement can come from at most one response.
  const { data: requirement } = await service.from('requirements').insert({ name: 'ZZ-QA from response', company_id: fx.companies.A, owner_id: fx.users.admin.id, status: 'active' }).select('id').single()
  fx.extra.requirements.push(requirement.id)
  const link1 = await service.from('catalogue_responses').update({ requirement_id: requirement.id }).eq('id', first.data.id)
  const link2 = await service.from('catalogue_responses').update({ requirement_id: requirement.id }).eq('id', again.data.id)
  checks.check('a requirement links to one response', !link1.error)
  checks.check('and cannot be linked to a second response (23505)', link2.error?.code === '23505', link2.error?.code)

  // Row-level security: who can read what.
  const aRows = await clientA.from('catalogue_responses').select('id, company_id, comment, items')
  checks.check('a client reads only their own company’s responses', !aRows.error && aRows.data.length === 2 && aRows.data.every((r) => r.company_id === fx.companies.A), String(aRows.data?.length))
  const bRows = await clientB.from('catalogue_responses').select('id, company_id, comment, items')
  checks.check('the other company reads only its own', !bRows.error && bRows.data.length === 1 && bRows.data[0].company_id === fx.companies.B)
  checks.check('no client sees another company’s comment or product notes', !JSON.stringify(aRows.data).includes('B comment') && !JSON.stringify(aRows.data).includes('secret-B-note') && !JSON.stringify(bRows.data).includes('secret-A-note'))
  const staffRows = await admin.from('catalogue_responses').select('id').in('id', [first.data.id, other.data.id, again.data.id])
  checks.check('staff read every response', staffRows.data?.length === 3)
  const salesRows = await sales.from('catalogue_responses').select('id').in('id', [first.data.id, other.data.id, again.data.id])
  checks.check('a salesperson can read responses (they work the queue)', salesRows.data?.length === 3)
  const anon = await anonClient().from('catalogue_responses').select('id')
  checks.check('an anonymous caller reads nothing', !anon.data || anon.data.length === 0)

  // Write protection: no API role can change a response, only the server (service role).
  const clientInsert = await clientA.from('catalogue_responses').insert({ ...base, company_id: fx.companies.A, status: 'processed' })
  checks.check('a client cannot insert a response through the API', Boolean(clientInsert.error))
  const clientUpdate = await clientA.from('catalogue_responses').update({ comment: 'tampered' }).eq('id', again.data.id).select('id')
  const afterUpdate = await service.from('catalogue_responses').select('comment').eq('id', again.data.id).single()
  checks.check('a client cannot edit a response through the API', afterUpdate.data?.comment === 'a later round' && !(clientUpdate.data && clientUpdate.data.length), clientUpdate.error?.message)
  const clientDelete = await clientA.from('catalogue_responses').delete().eq('id', again.data.id).select('id')
  const stillThere = await service.from('catalogue_responses').select('id').eq('id', again.data.id)
  checks.check('a client cannot delete a response through the API', stillThere.data?.length === 1 && !(clientDelete.data && clientDelete.data.length))
  const staffUpdate = await admin.from('catalogue_responses').update({ status: 'processed' }).eq('id', again.data.id).select('id')
  const staffAfter = await service.from('catalogue_responses').select('status').eq('id', again.data.id).single()
  checks.check('even staff cannot write through the API (the application writes with the service role)', staffAfter.data?.status === 'submitted' && !(staffUpdate.data && staffUpdate.data.length))
} catch (error) {
  console.error('script error:', error.message)
  exitCode = 1
} finally {
  const problems = await cleanup()
  if (problems.length) {
    console.error('CLEANUP PROBLEMS (run scripts/db-tests/_sweep.mjs):', problems.join('; '))
    exitCode = 1
  }
}
const ok = checks.report('catalogue responses (live)')
process.exitCode = ok && exitCode === 0 ? 0 : 1
}

if (probe.error) {
  console.error(`catalogue_responses is not available yet (${probe.error.code}: ${probe.error.message}).`)
  console.error('Apply supabase/migrations/20261041_catalogue_responses.sql in the Supabase SQL editor, then run this again.')
  process.exitCode = 2
} else {
  await run()
}
