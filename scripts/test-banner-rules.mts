import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { validateBanner, isBannerLive, isSafeLink, todayInIndia, audienceMatches } from '../src/lib/site/banner-rules.ts'

const base = { title: 'Diwali gifting', subtitle: '', cta_label: '', link_url: '', image_url: '', occasion: '', audience: 'both', starts_on: '', ends_on: '', is_active: true, sort_order: '' }

assert.ok('value' in validateBanner(base))
const ok = validateBanner({ ...base, cta_label: 'Shop', link_url: '/catalogue', starts_on: '2026-10-01', ends_on: '2026-11-15', sort_order: '2' })
assert.ok('value' in ok && ok.value.sort_order === 2)

const bad = (patch: object, field: string) => {
  const r = validateBanner({ ...base, ...patch })
  assert.ok('errors' in r && field in r.errors, `${field} should be rejected for ${JSON.stringify(patch)}`)
}
bad({ title: '  ' }, 'title')
bad({ title: 'x'.repeat(121) }, 'title')
bad({ link_url: 'java' + 'script:alert(1)' }, 'link_url')
bad({ link_url: '//evil.com' }, 'link_url')
bad({ link_url: 'http://insecure.com' }, 'link_url')
bad({ cta_label: 'Shop' }, 'link_url')
bad({ image_url: 'http://x.com/a.png' }, 'image_url')
bad({ image_url: 'https://localhost/a.png' }, 'image_url')
bad({ audience: 'everyone' }, 'audience')
bad({ starts_on: '2026-02-31' }, 'starts_on')
bad({ starts_on: '2026-11-10', ends_on: '2026-11-01' }, 'ends_on')
bad({ sort_order: '1.5' }, 'sort_order')
assert.equal(isSafeLink('/portal/catalogue'), true)
assert.equal(isSafeLink('https://example.com/x'), true)

const live = { is_active: true, starts_on: '2026-10-01', ends_on: '2026-10-31' }
assert.equal(isBannerLive(live, '2026-10-01'), true, 'start day inclusive')
assert.equal(isBannerLive(live, '2026-10-31'), true, 'end day inclusive')
assert.equal(isBannerLive(live, '2026-09-30'), false)
assert.equal(isBannerLive(live, '2026-11-01'), false)
assert.equal(isBannerLive({ ...live, is_active: false }, '2026-10-15'), false)
assert.equal(isBannerLive({ is_active: true, starts_on: null, ends_on: null }, '2030-01-01'), true)
assert.equal(todayInIndia(Date.UTC(2026, 9, 31, 20, 0, 0)), '2026-11-01', 'IST is ahead of UTC')
assert.equal(audienceMatches('both', 'portal'), true)
assert.equal(audienceMatches('public', 'portal'), false)
console.log('banner rule tests: all assertions passed')
