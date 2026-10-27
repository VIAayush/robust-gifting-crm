import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { isRequeueable, requeueMaxAgeMs, PROVIDER_SKIP_REASON, DEFAULT_REQUEUE_MAX_AGE_DAYS } from '../src/lib/notifications/requeue.ts'

const now = Date.UTC(2026, 9, 27, 12, 0, 0)
const day = 24 * 60 * 60 * 1000
const maxAge = requeueMaxAgeMs(undefined)
const row = (over: object = {}) => ({ status: 'skipped', channel: 'whatsapp', recipient_phone: '919999999999', last_error: PROVIDER_SKIP_REASON, created_at: new Date(now - day).toISOString(), ...over })

assert.equal(maxAge, DEFAULT_REQUEUE_MAX_AGE_DAYS * day)
assert.equal(isRequeueable(row(), now, maxAge), true, 'skipped for no provider, recent, has a phone')
assert.equal(isRequeueable(row({ channel: null }), now, maxAge), true, 'old rows without a channel are WhatsApp')
assert.equal(isRequeueable(row({ recipient_phone: null }), now, maxAge), false, 'no phone: nothing could be sent')
assert.equal(isRequeueable(row({ last_error: 'No valid phone number on record for this recipient' }), now, maxAge), false, 'skipped for another reason')
assert.equal(isRequeueable(row({ channel: 'email' }), now, maxAge), false, 'email ledger rows are never re-queued')
assert.equal(isRequeueable(row({ status: 'sent' }), now, maxAge), false)
assert.equal(isRequeueable(row({ status: 'failed' }), now, maxAge), false, 'failed rows have their own retry')
assert.equal(isRequeueable(row({ status: 'pending' }), now, maxAge), false)
assert.equal(isRequeueable(row({ created_at: new Date(now - 8 * day).toISOString() }), now, maxAge), false, 'too old: not sent as stale news')
assert.equal(isRequeueable(row({ created_at: 'garbage' }), now, maxAge), false)
assert.equal(requeueMaxAgeMs('3'), 3 * day)
assert.equal(requeueMaxAgeMs('0'), DEFAULT_REQUEUE_MAX_AGE_DAYS * day, 'invalid values fall back to the default')
assert.equal(requeueMaxAgeMs('abc'), DEFAULT_REQUEUE_MAX_AGE_DAYS * day)
assert.equal(requeueMaxAgeMs('365'), DEFAULT_REQUEUE_MAX_AGE_DAYS * day)
console.log('notification requeue tests: all assertions passed')
