import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client responses to a catalogue that staff sent them: which products they want (with quantities and notes)
 * and any comment or requested change. Stored per company in catalogue_responses (migration 20261041), never in
 * the assigned catalogue itself, so the catalogue the client was given is never changed by their answer.
 */

export const MAX_RESPONSE_ITEMS = 200
export const MAX_RESPONSE_QTY = 1_000_000
export const MAX_RESPONSE_NOTE = 500
export const MAX_RESPONSE_COMMENT = 2000
export const MIGRATION_MESSAGE =
  'Catalogue responses need the database migration 20261041_catalogue_responses.sql to be applied first.'

export type ResponseItemInput = { campaign_product_id: string; quantity: number | string; notes?: string }

export type ResponseItem = {
  campaign_product_id: string
  product_id: string
  name: string
  quantity: number
  notes: string | null
  unit_price: number
}

export type ResponseStatus = 'submitted' | 'processed'

export type ResponseRow = {
  id: string
  campaign_id: string
  company_id: string
  status: ResponseStatus
  comment: string | null
  items: ResponseItem[]
  revision: number
  submitted_at: string
  processed_at: string | null
  requirement_id: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function cleanText(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Missing table (migration not applied yet) as seen through PostgREST. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message || ''
  return /catalogue_responses/.test(message) && /does not exist|schema cache|could not find/i.test(message)
}

type Offering = { id: string; product_id: string; display_name: string; selling_price: number | string; moq: number | null }

/**
 * Validates what the browser sent against the offerings this company may actually see, and builds the stored
 * snapshot from DATABASE values (name, price) - nothing price-like is trusted from the browser.
 */
export function buildResponseItems(
  rawItems: unknown,
  offerings: Offering[],
): { ok: true; items: ResponseItem[] } | { ok: false; error: string } {
  const raw = Array.isArray(rawItems) ? rawItems : []
  if (raw.length > MAX_RESPONSE_ITEMS) return { ok: false, error: `A response can include up to ${MAX_RESPONSE_ITEMS} products.` }
  const byId = new Map(offerings.map((o) => [o.id, o]))
  const merged = new Map<string, { quantity: number; notes: string | null }>()
  for (const entry of raw as ResponseItemInput[]) {
    const id = String(entry?.campaign_product_id ?? '')
    if (!UUID.test(id)) return { ok: false, error: 'One of the products is not valid.' }
    const offering = byId.get(id)
    if (!offering) return { ok: false, error: 'Some products are no longer available in this catalogue. Refresh the page and try again.' }
    const quantity = Number(entry.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_RESPONSE_QTY) {
      return { ok: false, error: `${offering.display_name}: enter a whole quantity of at least 1.` }
    }
    const moq = Number(offering.moq) || 0
    if (moq > 1 && quantity < moq) return { ok: false, error: `${offering.display_name}: the minimum order quantity is ${moq}.` }
    const previous = merged.get(id)
    merged.set(id, { quantity: (previous?.quantity || 0) + quantity, notes: cleanText(entry.notes, MAX_RESPONSE_NOTE) || previous?.notes || null })
  }
  const items: ResponseItem[] = []
  for (const [id, entry] of merged) {
    const offering = byId.get(id) as Offering
    items.push({
      campaign_product_id: id,
      product_id: offering.product_id,
      name: offering.display_name,
      quantity: entry.quantity,
      notes: entry.notes,
      unit_price: Number(offering.selling_price),
    })
  }
  items.sort((a, b) => a.campaign_product_id.localeCompare(b.campaign_product_id))
  return { ok: true, items }
}

/** Two submissions with the same products, quantities, notes and comment are the same response. */
export function sameResponse(
  a: { items: { campaign_product_id: string; quantity: number; notes: string | null }[]; comment: string | null },
  b: { items: { campaign_product_id: string; quantity: number; notes: string | null }[]; comment: string | null },
) {
  const key = (r: typeof a) =>
    JSON.stringify([
      [...r.items].sort((x, y) => x.campaign_product_id.localeCompare(y.campaign_product_id)).map((i) => [i.campaign_product_id, i.quantity, i.notes || null]),
      r.comment || null,
    ])
  return key(a) === key(b)
}

export function responseSummary(row: { status: string; items: unknown[] | null; requirement_id?: string | null }) {
  const count = Array.isArray(row.items) ? row.items.length : 0
  if (row.status === 'processed') return row.requirement_id ? 'Processed – requirement created' : 'Processed'
  return count > 0 ? `Response received – ${count} product${count === 1 ? '' : 's'}` : 'Response received – comments only'
}

export type SubmitResult =
  | { ok: true; id: string; unchanged: boolean; revision: number }
  | { ok: false; error: string }

/**
 * Stores the client's response: updates the open one (revision + 1) or inserts a new one. Safe to repeat: an
 * identical resubmission changes nothing, and the partial unique index makes two concurrent first submissions
 * collapse into one row. Runs with the service role; the CALLER has already been verified.
 */
export async function saveOpenResponse(
  admin: SupabaseClient,
  input: { campaignId: string; companyId: string; userId: string; items: ResponseItem[]; comment: string | null },
): Promise<SubmitResult> {
  const read = async () =>
    admin
      .from('catalogue_responses')
      .select('id, items, comment, revision')
      .eq('campaign_id', input.campaignId)
      .eq('company_id', input.companyId)
      .eq('status', 'submitted')
      .maybeSingle()

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: open, error: readError } = await read()
    if (readError) return { ok: false, error: isMissingTable(readError) ? MIGRATION_MESSAGE : 'We could not save your response. Please try again.' }

    if (open) {
      const stored = { items: (open.items as ResponseItem[]) || [], comment: (open.comment as string | null) || null }
      if (sameResponse(stored, { items: input.items, comment: input.comment })) {
        return { ok: true, id: open.id as string, unchanged: true, revision: open.revision as number }
      }
      const revision = (Number(open.revision) || 1) + 1
      const { data: updated, error } = await admin
        .from('catalogue_responses')
        .update({ items: input.items, comment: input.comment, revision, submitted_by: input.userId, submitted_at: new Date().toISOString() })
        .eq('id', open.id)
        .eq('status', 'submitted')
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, error: 'We could not save your response. Please try again.' }
      if (updated) return { ok: true, id: updated.id as string, unchanged: false, revision }
      continue // staff processed it between the read and the write: the next pass inserts a fresh response
    }

    const { data: inserted, error } = await admin
      .from('catalogue_responses')
      .insert({
        campaign_id: input.campaignId,
        company_id: input.companyId,
        submitted_by: input.userId,
        status: 'submitted',
        comment: input.comment,
        items: input.items,
        revision: 1,
      })
      .select('id')
      .single()
    if (!error && inserted) return { ok: true, id: inserted.id as string, unchanged: false, revision: 1 }
    if (error?.code === '23505') continue // lost a race to an identical first submission: update that row instead
    return { ok: false, error: isMissingTable(error) ? MIGRATION_MESSAGE : 'We could not save your response. Please try again.' }
  }
  return { ok: false, error: 'We could not save your response. Please try again.' }
}
