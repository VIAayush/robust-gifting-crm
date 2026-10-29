// Shared helpers for the live database scripts (05, 06). Everything they create is tagged "ZZ-QA" and removed by the
// sweeper below, which only ever touches rows that belong to ZZ-QA companies, ZZ-QA catalogues or zz-qa-*@qa.invalid
// users. No e-mail is sent (users are created pre-confirmed with an unroutable .invalid address, and the notification
// outbox only ever records "skipped"/"failed" rows when no provider is configured).
// Run a script with: node --env-file=.env scripts/db-tests/<file>.mjs
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

export async function sessionFor(user) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw new Error(`sign-in failed for ${user.email}: ${error.message}`)
  return client
}

export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

export class Checks {
  passed = 0
  failed = []
  check(name, ok, detail = '') {
    if (ok) this.passed++
    else this.failed.push(`${name}${detail ? ` (${detail})` : ''}`)
  }
  report(label) {
    const total = this.passed + this.failed.length
    console.log(`${label}: ${this.passed} of ${total} checks passed`)
    for (const f of this.failed) console.log(`  FAILED: ${f}`)
    return this.failed.length === 0
  }
}

/** Creates two companies, an admin, a salesperson, and a client admin per company. Returns { fx, cleanup }. */
export async function createFixtures(service) {
  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
  const fx = { tag, users: {}, companies: {}, extra: { campaigns: [], requirements: [], catalogueResponses: [] } }
  const password = () => `Qa!${randomBytes(9).toString('base64url')}9`

  for (const key of ['A', 'B']) {
    const { data, error } = await service.from('companies').insert({ name: `ZZ-QA company ${key} ${tag}`, status: 'active', notes: 'ZZ-QA temporary test company' }).select('id').single()
    if (error) throw new Error(`company ${key}: ${error.message}`)
    fx.companies[key] = data.id
  }
  async function user(key, role, companyKey) {
    const email = `zz-qa-${tag}-${key}@qa.invalid`
    const pw = password()
    const { data, error } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: `ZZ QA ${key}` } })
    if (error) throw new Error(`user ${key}: ${error.message}`)
    const { error: profileError } = await service
      .from('profiles')
      .upsert({ id: data.user.id, email, role, is_active: true, full_name: `ZZ QA ${key}`, company_id: companyKey ? fx.companies[companyKey] : null })
    if (profileError) throw new Error(`profile ${key}: ${profileError.message}`)
    fx.users[key] = { id: data.user.id, email, password: pw, role }
  }
  await user('admin', 'admin')
  await user('sales', 'sales')
  await user('clientA', 'client_admin', 'A')
  await user('clientB', 'client_admin', 'B')
  for (const key of ['A', 'B']) await service.from('companies').update({ owner_id: fx.users.admin.id }).eq('id', fx.companies[key])

  return { fx, cleanup: () => sweepQaFixtures(service, { tag }) }
}

const MISSING_TABLE = (error) => error && (error.code === 'PGRST205' || error.code === '42P01')

/**
 * Removes ZZ-QA test data. { tag } limits it to one run; { all: true } removes every ZZ-QA fixture (including the
 * individual-customer company a B2C test purchase creates). Returns a list of problems (empty = clean).
 */
export async function sweepQaFixtures(service, { tag, all } = {}) {
  const problems = []
  const tryDelete = async (table, column, ids) => {
    if (!ids.length) return 0
    const { error, count } = await service.from(table).delete({ count: 'exact' }).in(column, ids)
    if (error && !MISSING_TABLE(error)) {
      problems.push(`${table}.${column}: ${error.message}`)
      return -1
    }
    return count || 0
  }

  // Which rows are ours.
  const nameLike = tag ? `ZZ-QA%${tag}%` : 'ZZ-QA%'
  const { data: companies } = await service.from('companies').select('id, name').ilike('name', nameLike)
  let companyRows = companies || []
  if (all || !tag) {
    const { data: individual } = await service.from('companies').select('id, name').ilike('name', 'ZZ-QA B2C%')
    companyRows = [...new Map([...companyRows, ...(individual || [])].map((c) => [c.id, c])).values()]
  }
  const companyIds = companyRows.map((c) => c.id)
  const emailLike = tag ? `zz-qa-${tag}-%@qa.invalid` : 'zz-qa-%@qa.invalid'
  const { data: profiles } = await service.from('profiles').select('id, email').ilike('email', emailLike)
  const userIds = (profiles || []).map((p) => p.id)
  const { data: campaigns } = await service.from('campaigns').select('id').ilike('name', tag ? `ZZ-QA%${tag}%` : 'ZZ-QA%')
  const campaignIds = (campaigns || []).map((c) => c.id)
  if (!companyIds.length && !userIds.length && !campaignIds.length) return problems

  const idsOf = async (table, column, ids, pick = 'id') => {
    if (!ids.length) return []
    const { data } = await service.from(table).select(pick).in(column, ids)
    return (data || []).map((r) => r[pick])
  }

  // Orders (and everything that hangs off them), checkouts, quotations, requirements.
  const orderIds = await idsOf('orders', 'company_id', companyIds)
  const checkoutIds = [...new Set([...(await idsOf('storefront_checkouts', 'company_id', companyIds)), ...(await idsOf('storefront_checkouts', 'order_id', orderIds))])]
  const invoiceIds = await idsOf('invoices', 'order_id', orderIds)
  const quotationIds = await idsOf('quotations', 'company_id', companyIds)
  const requirementIds = await idsOf('requirements', 'company_id', companyIds)
  const paymentIds = await idsOf('storefront_payments', 'checkout_id', checkoutIds)

  if (checkoutIds.length) await service.from('storefront_checkouts').update({ order_id: null }).in('id', checkoutIds)
  await tryDelete('payments', 'invoice_id', invoiceIds)
  for (const table of ['payables', 'order_status_history', 'order_items', 'order_assignments', 'mockups', 'reviews', 'tasks', 'invoices']) {
    await tryDelete(table, 'order_id', orderIds)
  }
  await tryDelete('orders', 'id', orderIds)
  await tryDelete('storefront_checkout_items', 'checkout_id', checkoutIds)
  await tryDelete('storefront_payments', 'checkout_id', checkoutIds)
  await tryDelete('storefront_checkouts', 'id', checkoutIds)
  for (const table of ['quotation_history', 'quotation_items', 'client_comments']) await tryDelete(table, 'quotation_id', quotationIds)
  await tryDelete('quotations', 'id', quotationIds)
  await tryDelete('catalogue_responses', 'company_id', companyIds)
  for (const table of ['requirement_events', 'requirement_products', 'mockups', 'tasks', 'sample_movements']) await tryDelete(table, 'requirement_id', requirementIds)
  await tryDelete('requirements', 'id', requirementIds)

  // Catalogues and company-scoped rows.
  const allCampaignIds = [...new Set([...campaignIds, ...(await idsOf('campaign_companies', 'company_id', companyIds, 'campaign_id'))])].filter((id) => campaignIds.includes(id))
  for (const table of ['campaign_events', 'campaign_products', 'campaign_companies']) await tryDelete(table, 'campaign_id', allCampaignIds)
  await tryDelete('campaigns', 'id', allCampaignIds)
  for (const table of ['company_product_interests', 'company_product_access', 'client_product_selections', 'sample_requests', 'sample_movements', 'client_comments', 'leads', 'contacts', 'notifications', 'branches']) {
    await tryDelete(table, 'company_id', companyIds)
  }

  // Outbox rows the tests caused (they only ever record skipped/failed attempts); matched by our own entity ids and names.
  const entityIds = [...requirementIds, ...orderIds, ...paymentIds, ...checkoutIds, ...quotationIds, ...allCampaignIds, ...companyIds]
  await tryDelete('notification_outbox', 'entity_id', entityIds)
  const { data: byName } = await service.from('notification_outbox').select('id').or('recipient_name.ilike.ZZ-QA%,recipient_name.ilike.ZZ QA%')
  await tryDelete('notification_outbox', 'id', (byName || []).map((r) => r.id))

  // The audit rows written by the test users' own actions (audit_logs.user_id is a foreign key to profiles). Scoped strictly
  // to the ids of the ZZ-QA users found above, so no genuine audit record is touched.
  await tryDelete('audit_logs', 'user_id', userIds)

  // Companies are owned by profiles, so they go before the users.
  await tryDelete('companies', 'id', companyIds)
  for (const id of userIds) {
    const { error: profileError } = await service.from('profiles').delete().eq('id', id)
    if (profileError) problems.push(`profile ${id}: ${profileError.message}`)
    const { error } = await service.auth.admin.deleteUser(id)
    if (error) problems.push(`auth user ${id}: ${error.message}`)
  }
  return problems
}
