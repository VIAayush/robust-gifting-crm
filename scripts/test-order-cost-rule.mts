// Static guard for decision D1 (option B): an order converted from a quotation never gets an invented cost or margin.
// Reads the migration text only; the behaviour against the real database is checked after the migration is applied
// (docs/DATABASE_MIGRATION_RUNBOOK.md, "Order cost rule").
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const migrationsDir = join(root, 'supabase/migrations')
const m33 = readFileSync(join(migrationsDir, '20261033_quotation_item_decisions.sql'), 'utf8')

// Strip comments so the explanation that mentions the old rule does not count as code.
const code = m33.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

assert.ok(!/0\.62/.test(code), 'the 62% cost assumption must not be in migration 33')
assert.ok(/supplier_cost\s*>\s*0/.test(code), 'only a positive supplier cost counts as a verified cost')
assert.ok(/v_unknown_cost_lines\s*>\s*0\s+then\s+v_cost\s*:=\s*0/i.test(code), 'any line without a verified cost leaves the order cost at 0')
// The conversion fills only the product cost, so no profit is verified at creation whatever the lines cost.
assert.ok(/v_cost,\s*v_cost,\s*0,\s*q\.campaign_id/.test(code), 'gross profit is stored as 0 at conversion; recalc_order_cost stores it once every cost is entered')
assert.ok(!/v_value\s*-\s*v_cost/.test(code), 'no profit is derived from the order value minus a partial cost')

// Nothing newer may bring the assumption back, and the application code never applies one.
for (const f of readdirSync(migrationsDir).filter((n) => n >= '20261033')) {
  assert.ok(!/p\.price\s*\*\s*0\.6/.test(readFileSync(join(migrationsDir, f), 'utf8').replace(/--.*$/gm, '')), `${f} must not derive a cost from the price`)
}

console.log('order cost rule tests: all assertions passed')
