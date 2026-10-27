// Static scan: a status value written in a query must exist in the database enum / check constraint.
// A wrong literal makes PostgREST reject the whole query (invalid enum input), so the page silently shows nothing.
// Covers single-line queries `from('<table>')...eq|neq|in('status', ...)` across src/. Static review only: it proves the
// code and schema.sql agree, not that the live database matches schema.sql.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8')
const migrations = readdirSync(join(root, 'supabase/migrations')).map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n')

function enumValues(name: string): string[] {
  const m = schema.match(new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`, 'i'))
  assert.ok(m, `enum ${name} not found in schema.sql`)
  const values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  for (const add of migrations.matchAll(new RegExp(`alter type public\\.${name} add value (?:if not exists )?'([^']+)'`, 'gi'))) values.push(add[1])
  return values
}

const allowed: Record<string, string[]> = {
  invoices: enumValues('invoice_status'),
  quotations: enumValues('quotation_status'),
  orders: enumValues('order_status'),
  requirements: enumValues('requirement_status'),
  activities: enumValues('activity_status'),
  payables: ['unpaid', 'partial', 'paid'],
  tasks: ['open', 'in_progress', 'blocked', 'done', 'cancelled'],
}
// the tasks constraint is widened by migration 38; assert the migration really does that
assert.ok(/tasks_status_check[\s\S]{0,200}'blocked'/.test(migrations), "a migration must allow tasks.status = 'blocked'")

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

let checked = 0
const bad: string[] = []
for (const file of walk(join(root, 'src'))) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    // the table is named on this line or on one of the lines above it in the same chained query
    let table: string | undefined
    for (let back = 0; back <= 8 && i - back >= 0 && !table; back++) {
      const prev = lines[i - back]
      table = prev.match(/\.from\('([a-z_]+)'\)/)?.[1]
      if (!table && back > 0 && /;\s*$/.test(prev)) break
    }
    if (!table || !allowed[table]) return
    for (const m of line.matchAll(/\.(?:eq|neq|in)\('status',\s*(\[[^\]]*\]|'[^']*')\)/g)) {
      for (const v of m[1].matchAll(/'([^']*)'/g)) {
        checked++
        if (!allowed[table].includes(v[1])) bad.push(`${file.slice(root.length)}:${i + 1} ${table}.status = '${v[1]}' is not one of ${allowed[table].join(', ')}`)
      }
    }
  })
}
assert.deepEqual(bad, [], `invalid status literals:\n${bad.join('\n')}`)
assert.ok(checked > 10, `scan looked at only ${checked} literals; the pattern probably stopped matching`)

// the filter options offered on the invoices screen must all be real statuses
const invoicesPage = readFileSync(join(root, 'src/app/crm/invoices/page.tsx'), 'utf8')
const options = [...invoicesPage.matchAll(/\{ value: '([a-z_]+)', label:/g)].map((m) => m[1])
for (const o of options) assert.ok(allowed.invoices.includes(o), `invoice filter option '${o}' is not an invoice status`)

console.log(`status literal scan: all assertions passed (${checked} literals checked)`)
