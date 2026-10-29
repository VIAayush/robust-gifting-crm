// Live check for Issues 1 and 3 (read-mostly): the staff Requirements queue query and who can see what, with REAL
// signed-in sessions. Creates ZZ-QA fixtures, removes them in a finally block, sends no e-mail.
//   node --env-file=.env scripts/db-tests/05-requirements-queue.mjs
import { Checks, anonClient, createFixtures, serviceClient, sessionFor } from './_fixtures.mjs'

const OLD_SELECT = '*, company:companies(id, name), owner:profiles(id, full_name)'
const NEW_SELECT = '*, company:companies(id, name), owner:profiles!requirements_owner_id_fkey(id, full_name)'

const service = serviceClient()
const checks = new Checks()
const { fx, cleanup } = await createFixtures(service)
let exitCode = 0
try {
  const admin = await sessionFor(fx.users.admin)
  const sales = await sessionFor(fx.users.sales)
  const clientA = await sessionFor(fx.users.clientA)
  const clientB = await sessionFor(fx.users.clientB)

  // A client-created requirement (as the portal action writes it) and a staff-created one that has been shared with the client.
  const insert = async (row) => {
    const { data, error } = await service.from('requirements').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    fx.extra.requirements.push(data.id)
    return data.id
  }
  const clientReq = await insert({ name: 'ZZ-QA client requirement', company_id: fx.companies.A, owner_id: fx.users.admin.id, status: 'active', workflow_stage: 'submitted', quantity: 10, budget: 100 })
  const staffReq = await insert({ name: 'ZZ-QA staff requirement', company_id: fx.companies.A, owner_id: fx.users.admin.id, status: 'active', workflow_stage: 'admin_approved', quantity: 5, budget: 200 })
  await service.from('requirement_events').insert([
    { requirement_id: clientReq, actor_id: fx.users.clientA.id, actor_kind: 'client', from_stage: null, to_stage: 'submitted', visible_to_client: true },
    { requirement_id: staffReq, actor_id: fx.users.admin.id, actor_kind: 'staff', from_stage: null, to_stage: 'admin_approved', visible_to_client: true },
  ])

  // Issue 1: the old unqualified embed is ambiguous and returns nothing; the qualified one returns the queue.
  const old = await admin.from('requirements').select(OLD_SELECT).eq('company_id', fx.companies.A)
  checks.check('old select fails as ambiguous (PGRST201) - the cause of the empty queue', old.error?.code === 'PGRST201' && !(old.data && old.data.length), old.error?.code)
  const fixed = await admin.from('requirements').select(NEW_SELECT).eq('company_id', fx.companies.A).order('created_at', { ascending: false })
  checks.check('fixed select returns both requirements to an admin', !fixed.error && fixed.data?.length === 2, fixed.error?.message)
  checks.check('company and owner are embedded', fixed.data?.every((r) => r.company?.name && r.owner?.full_name))

  // Origin comes from the first history row.
  const events = await admin.from('requirement_events').select('requirement_id, actor_kind').is('from_stage', null).in('requirement_id', [clientReq, staffReq])
  const origin = new Map((events.data || []).map((e) => [e.requirement_id, e.actor_kind]))
  checks.check('staff can read history to tell client-created from staff-created', origin.get(clientReq) === 'client' && origin.get(staffReq) === 'staff')

  // Permissions: the queue respects roles and company isolation.
  const salesRows = await sales.from('requirements').select(NEW_SELECT).eq('company_id', fx.companies.A)
  checks.check('a salesperson who does not own them sees none', !salesRows.error && salesRows.data.length === 0, String(salesRows.data?.length))
  const clientARows = await clientA.from('requirements').select('id, name, workflow_stage').eq('company_id', fx.companies.A)
  checks.check('the client sees both of their company’s requirements (the shared one appears in their portal)', clientARows.data?.length === 2)
  const clientBRows = await clientB.from('requirements').select('id').eq('company_id', fx.companies.A)
  checks.check('another company’s client sees nothing', clientBRows.data?.length === 0)
  const anon = await anonClient().from('requirements').select('id').eq('company_id', fx.companies.A)
  checks.check('an anonymous caller sees nothing', !anon.data || anon.data.length === 0)

  // Issue 3: the shared requirement can be answered by the client through the guarded function, once, with history.
  const confirm = await clientA.rpc('requirement_transition', { p_requirement_id: staffReq, p_to_stage: 'client_confirmed', p_note: null, p_note_visible: true })
  checks.check('the client can confirm a requirement shared by staff', !confirm.error, confirm.error?.message)
  const repeat = await clientA.rpc('requirement_transition', { p_requirement_id: staffReq, p_to_stage: 'client_confirmed', p_note: null, p_note_visible: true })
  checks.check('answering twice is a harmless no-op', !repeat.error, repeat.error?.message)
  const history = await service.from('requirement_events').select('actor_kind, to_stage').eq('requirement_id', staffReq).order('created_at')
  checks.check('exactly one client confirmation row in the history (no duplicate)', history.data?.filter((e) => e.to_stage === 'client_confirmed').length === 1)
  const other = await clientB.rpc('requirement_transition', { p_requirement_id: staffReq, p_to_stage: 'client_confirmed', p_note: null, p_note_visible: true })
  checks.check('another company’s client cannot answer it', Boolean(other.error))
  const sendBack = await clientA.rpc('requirement_transition', { p_requirement_id: clientReq, p_to_stage: 'client_confirmed', p_note: null, p_note_visible: true })
  checks.check('a client cannot confirm a requirement that is still awaiting staff review', Boolean(sendBack.error))
  const direct = await clientA.from('requirements').update({ workflow_stage: 'selection_approved' }).eq('id', clientReq)
  const after = await service.from('requirements').select('workflow_stage').eq('id', clientReq).single()
  checks.check('a client cannot move the stage by writing the column directly', after.data?.workflow_stage === 'submitted', direct.error?.message)

  // Staff accept the client-created one; nothing quotation- or order-related happens by itself.
  const approve = await admin.rpc('requirement_transition', { p_requirement_id: clientReq, p_to_stage: 'admin_approved', p_note: null, p_note_visible: true })
  checks.check('admin can accept the client-created requirement', !approve.error, approve.error?.message)
  const quotes = await service.from('quotations').select('id').eq('requirement_id', clientReq)
  const orders = await service.from('orders').select('id').eq('requirement_id', clientReq)
  checks.check('accepting does not create a quotation or an order', quotes.data?.length === 0 && orders.data?.length === 0)
  const early = await admin.from('quotations').insert({ requirement_id: clientReq, company_id: fx.companies.A, status: 'draft', quotation_number: `ZZQA-${fx.tag}` }).select('id')
  checks.check('a quotation cannot be created before the client confirmed and the selection was approved', Boolean(early.error), early.error?.message)
} catch (error) {
  console.error('script error:', error.message)
  exitCode = 1
} finally {
  const problems = await cleanup()
  if (problems.length) {
    console.error('CLEANUP PROBLEMS (remove these ZZ-QA rows by hand):', problems.join('; '))
    exitCode = 1
  }
}
const ok = checks.report('requirements queue (live)')
process.exitCode = ok && exitCode === 0 ? 0 : 1
