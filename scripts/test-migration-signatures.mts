// Regression guard found by applying migration 39 to the real database: CREATE OR REPLACE FUNCTION cannot remove a
// parameter default ("42P13 cannot remove parameter defaults from existing function"), and the offline SQL parser
// does not catch it. The live signatures below were read from the database (pg_get_function_arguments) on 28 Oct 2026,
// before any of migrations 20261026 to 20261039 was applied; every later migration that replaces one of these functions
// must keep the same parameter names and defaults.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const dir = join(root, 'supabase/migrations')

// function -> exact parameter list as the live database reports it (defaults included)
const live: Record<string, string> = {
  assign_order: 'p_order_id uuid, p_assigned_to uuid, p_department_id uuid, p_note text default null',
  record_campaign_event: "p_campaign_id uuid, p_event_type text, p_payload jsonb default '{}'::jsonb",
  advance_order_stage: 'p_order_id uuid, p_status public.order_status default null, p_assigned_to uuid default null, p_department_id uuid default null, p_comment text default null, p_stage_due date default null, p_next_action text default null',
  client_mark_quotation_viewed: 'p_quotation_id uuid',
  client_respond_quotation: 'p_quotation_id uuid, p_accept boolean, p_comment text',
  convert_quotation_to_order: 'p_quotation_id uuid',
  recalc_order_cost: 'p_order_id uuid',
  has_any_role: 'roles public.app_role[]',
}

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase()

let checked = 0
for (const file of readdirSync(dir).filter((f) => f >= '20261026').sort()) {
  const text = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, '')
  for (const m of text.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*returns/gi)) {
    const name = m[1]
    if (!(name in live)) continue
    assert.equal(norm(m[2]), norm(live[name]), `${file}: ${name} must keep the live parameter names and defaults`)
    checked += 1
  }
}
assert.ok(checked >= 8, `expected to check the replaced functions, checked ${checked}`)

console.log('migration signature tests: all assertions passed')
