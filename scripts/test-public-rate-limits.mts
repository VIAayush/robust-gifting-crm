// Public actions refuse a caller who exceeds the limit, count per connection, and key on x-real-ip first.
// Isolated: the database limiter function is absent in the fake, so the in-memory window is what is exercised.
// The shared database limiter (migration 36) is BLOCKED until a database exists.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { submitCartQuote, submitCartOrder } from '../src/app/cart/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { requestPasswordReset, signUp } from '../src/app/login/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { createCheckout } from '../src/app/checkout/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { RATE_LIMIT_MESSAGE, clientKeyFromHeaders, hashedKey } from '../src/lib/security/rate-limit.ts'

const quiet = console.error
console.error = () => undefined

function asCaller(ip: string, extra: Record<string, string> = {}) {
  const db = new FakeDb()
  install(db, { headers: { 'x-real-ip': ip, host: 'localhost:3000', ...extra } })
  return db
}
type R = { error?: string } | { redirected: string } | undefined
async function attempt(fn: () => Promise<unknown>): Promise<R> {
  try {
    return (await fn()) as R
  } catch {
    return undefined // any other failure (stubbed auth etc.) is not what is being measured
  }
}
const limited = (r: R) => Boolean(r && 'error' in r && r.error === RATE_LIMIT_MESSAGE)

// cart quote: 5 per window, the 6th is refused
{
  asCaller('198.51.100.1')
  const results: R[] = []
  for (let i = 0; i < 6; i++) results.push(await attempt(() => submitCartQuote(form({ full_name: '' }))))
  assert.deepEqual(results.map(limited), [false, false, false, false, false, true])
}
// a different connection is not affected
{
  asCaller('198.51.100.2')
  assert.equal(limited(await attempt(() => submitCartQuote(form({ full_name: '' })))), false)
}
// cart order and checkout creation: 10 per window (they share the 'order' bucket)
{
  asCaller('198.51.100.3')
  let blockedAt = -1
  for (let i = 0; i < 12 && blockedAt < 0; i++) {
    const r = i % 2 === 0 ? await attempt(() => submitCartOrder(form({ full_name: '' }))) : await attempt(() => createCheckout([], {} as never))
    if (limited(r)) blockedAt = i
  }
  assert.equal(blockedAt, 10, 'the 11th order-creating call from one connection is refused')
}
// sign-up and reset: a single mailbox cannot be flooded from many connections (3 per hour per address)
{
  let blocked = 0
  for (let i = 0; i < 6; i++) {
    asCaller(`203.0.113.${50 + i}`)
    const r = await attempt(() => requestPasswordReset(form({ email: 'victim@example.test' })))
    if (limited(r)) blocked++
  }
  assert.equal(blocked, 3, 'only 3 reset mails for one address per hour, whatever the source')
  asCaller('203.0.113.99')
  assert.equal(limited(await attempt(() => requestPasswordReset(form({ email: 'someone.else@example.test' })))), false, 'other addresses are unaffected')
  asCaller('203.0.113.98')
  const signUps: R[] = []
  for (let i = 0; i < 4; i++) {
    signUps.push(await attempt(() => signUp(form({ full_name: 'X', email: 'victim@example.test', password: 'Aa1!aaaaaa', confirm_password: 'Aa1!aaaaaa' }))))
  }
  assert.ok(signUps.every(limited), 'sign-up to an already-flooded address is refused')
}
// the key prefers x-real-ip, so a spoofed x-forwarded-for does not buy a fresh allowance
{
  const h = (real: string | null, fwd: string | null) => ({ get: (n: string) => (n === 'x-real-ip' ? real : n === 'x-forwarded-for' ? fwd : null) })
  assert.equal(clientKeyFromHeaders(h('198.51.100.7', '1.1.1.1'), 'b'), clientKeyFromHeaders(h('198.51.100.7', '2.2.2.2'), 'b'))
  assert.notEqual(clientKeyFromHeaders(h('198.51.100.7', null), 'b'), clientKeyFromHeaders(h('198.51.100.8', null), 'b'))
  assert.equal(clientKeyFromHeaders(h(null, '9.9.9.9, 10.0.0.1'), 'b'), clientKeyFromHeaders(h(null, '9.9.9.9'), 'b'), 'falls back to the first forwarded hop')
  assert.notEqual(clientKeyFromHeaders(h('1.1.1.1', null), 'a'), clientKeyFromHeaders(h('1.1.1.1', null), 'b'), 'buckets do not share counters')
  assert.ok(!clientKeyFromHeaders(h('198.51.100.7', null), 'b').includes('198'), 'the address is never stored in clear')
  assert.equal(hashedKey(' Victim@Example.test ', 'x'), hashedKey('victim@example.test', 'x'), 'e-mail keys ignore case and spaces')
}
console.error = quiet
console.log('public rate limit tests: all assertions passed')
