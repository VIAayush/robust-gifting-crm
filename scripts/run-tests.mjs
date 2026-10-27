// Runs every isolated test (scripts/test-*.mts) and, if Python + pglast are available, the offline migration syntax check.
// No database, no network, no external provider is contacted. Usage: npm test
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptsDir = path.join(root, 'scripts')
const tests = readdirSync(scriptsDir).filter((f) => /^test-.*\.mts$/.test(f)).sort()

let passed = 0
const failed = []
for (const file of tests) {
  const result = spawnSync(process.execPath, ['--import', './scripts/register-alias.mjs', `scripts/${file}`], { cwd: root, encoding: 'utf8' })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  // A test must exit 0 AND print its own success line; a test that crashes before asserting cannot pass silently.
  if (result.status === 0 && /assertions passed/.test(output)) {
    passed++
    console.log(`PASS  ${file}`)
  } else {
    failed.push(file)
    console.log(`FAIL  ${file}`)
    console.log(output.split('\n').filter((l) => !/ExperimentalWarning|MODULE_TYPELESS|Reparsing|trace-warnings|To eliminate/.test(l)).slice(0, 25).join('\n'))
  }
}

let sqlStatus = 'SKIPPED (python or pglast not available)'
const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['scripts/check-sql-syntax.py'], { cwd: root, encoding: 'utf8' })
if (python.status === 0) sqlStatus = 'PASS (all pending migrations parse)'
else if (python.error || /No module named pglast/.test(`${python.stderr}`)) sqlStatus = 'SKIPPED (python or pglast not available)'
else {
  sqlStatus = 'FAIL'
  console.log(python.stdout)
}

console.log('')
console.log(`Test files: ${tests.length}, passed: ${passed}, failed: ${failed.length}`)
console.log(`Migration syntax check: ${sqlStatus}`)
process.exit(failed.length > 0 || sqlStatus === 'FAIL' ? 1 : 0)
