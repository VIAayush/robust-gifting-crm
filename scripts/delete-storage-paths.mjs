/**
 * Bounded-batch deletion of Supabase Storage objects from a JSON manifest of
 * paths. Intentionally requires an explicit numeric --limit (never
 * unbounded) and processes one fixed-size chunk per invocation, tracked by
 * --offset, so a mass-delete can be reviewed and run in controlled steps.
 *
 * Usage:
 *   node scripts/delete-storage-paths.mjs --file=<manifest.json> --bucket=<bucket> --offset=0 --limit=50 [--apply]
 *
 * <manifest.json> must be a JSON array of either plain path strings or
 * {path: string, ...} objects. Without --apply, only lists what would be
 * deleted. Writes results to <file>.deleted.json (appends across runs).
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv('.env')

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

if (!args.file || !args.bucket || args.limit === undefined) {
  console.error('Usage: --file=<manifest.json> --bucket=<bucket> --offset=0 --limit=N [--apply]')
  process.exit(1)
}

const APPLY = Boolean(args.apply)
const OFFSET = Number(args.offset || 0)
const LIMIT = Number(args.limit)
if (!Number.isFinite(LIMIT) || LIMIT <= 0 || LIMIT > 200) {
  console.error('LIMIT must be a positive number <= 200 (bounded batches only)')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const raw = JSON.parse(fs.readFileSync(args.file, 'utf8'))
const allPaths = raw.map((r) => (typeof r === 'string' ? r : r.path))
const batch = allPaths.slice(OFFSET, OFFSET + LIMIT)

console.log(`Bucket=${args.bucket} total=${allPaths.length} offset=${OFFSET} batchSize=${batch.length} apply=${APPLY}`)

if (!APPLY) {
  console.log('DRY RUN - would delete:')
  batch.forEach((p) => console.log('  ' + p))
  process.exit(0)
}

const { data, error } = await admin.storage.from(args.bucket).remove(batch)

const resultsFile = args.file + '.deleted.json'
const prior = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : []
const thisRun = {
  offset: OFFSET,
  requested: batch,
  removedCount: data?.length || 0,
  error: error ? error.message : null,
  timestamp: new Date().toISOString(),
}
fs.writeFileSync(resultsFile, JSON.stringify([...prior, thisRun], null, 2))

console.log(JSON.stringify({ removed: data?.length || 0, error: error?.message || null }, null, 2))
console.log(`Next offset: ${OFFSET + LIMIT} (of ${allPaths.length})`)
