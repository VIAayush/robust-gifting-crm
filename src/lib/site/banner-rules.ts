/** Validation and scheduling rules for CRM-managed site banners. Pure, so they are unit-tested. */

export type BannerAudience = 'public' | 'portal' | 'both'

export type BannerInput = {
  title: string
  subtitle: string
  cta_label: string
  link_url: string
  image_url: string
  occasion: string
  audience: string
  starts_on: string
  ends_on: string
  is_active: boolean
  sort_order: string
}

export type BannerValue = {
  title: string
  subtitle: string | null
  cta_label: string | null
  link_url: string | null
  image_url: string | null
  occasion: string | null
  audience: BannerAudience
  starts_on: string | null
  ends_on: string | null
  is_active: boolean
  sort_order: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: string) {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Links must stay on this site ("/...") or be https. Protocol-relative and script URLs are refused. */
export function isSafeLink(value: string) {
  if (value.startsWith('//')) return false
  if (value.startsWith('/')) return !value.includes('\\')
  return /^https:\/\/[^\s]+$/i.test(value) && !/^https:\/\/(localhost|127\.0\.0\.1)/i.test(value)
}

export function isSafeImageUrl(value: string) {
  return /^https:\/\/[^\s]+$/i.test(value) && !/^https:\/\/(localhost|127\.0\.0\.1)/i.test(value)
}

export function validateBanner(input: BannerInput): { value: BannerValue } | { errors: Partial<Record<keyof BannerInput, string>> } {
  const errors: Partial<Record<keyof BannerInput, string>> = {}
  const title = input.title.trim()
  if (!title) errors.title = 'Give the banner a headline.'
  else if (title.length > 120) errors.title = 'Keep the headline under 120 characters.'

  const subtitle = input.subtitle.trim()
  if (subtitle.length > 240) errors.subtitle = 'Keep the subtitle under 240 characters.'

  const cta = input.cta_label.trim()
  if (cta.length > 40) errors.cta_label = 'Keep the button label under 40 characters.'

  const link = input.link_url.trim()
  if (link && (link.length > 500 || !isSafeLink(link))) errors.link_url = 'Use a page on this site (starting with /) or a full https:// link.'
  if (cta && !link) errors.link_url = 'Add a link for the button, or clear the button label.'

  const image = input.image_url.trim()
  if (image && (image.length > 500 || !isSafeImageUrl(image))) errors.image_url = 'The image must be a full https:// address.'

  const occasion = input.occasion.trim()
  if (occasion.length > 60) errors.occasion = 'Keep the occasion under 60 characters.'

  if (input.audience !== 'public' && input.audience !== 'portal' && input.audience !== 'both') errors.audience = 'Choose where the banner shows.'

  const starts = input.starts_on.trim()
  const ends = input.ends_on.trim()
  if (starts && !validDate(starts)) errors.starts_on = 'Enter a valid start date.'
  if (ends && !validDate(ends)) errors.ends_on = 'Enter a valid end date.'
  if (!errors.starts_on && !errors.ends_on && starts && ends && ends < starts) errors.ends_on = 'The end date cannot be before the start date.'

  const order = input.sort_order.trim() === '' ? 0 : Number(input.sort_order)
  if (!Number.isInteger(order) || order < -1000 || order > 1000) errors.sort_order = 'Display order must be a whole number.'

  if (Object.keys(errors).length > 0) return { errors }
  return {
    value: {
      title,
      subtitle: subtitle || null,
      cta_label: cta || null,
      link_url: link || null,
      image_url: image || null,
      occasion: occasion || null,
      audience: input.audience as BannerAudience,
      starts_on: starts || null,
      ends_on: ends || null,
      is_active: input.is_active,
      sort_order: order,
    },
  }
}

/** Live = active and today (India date) inside the optional window, both ends inclusive. */
export function isBannerLive(banner: { is_active: boolean; starts_on: string | null; ends_on: string | null }, today: string) {
  if (!banner.is_active) return false
  if (banner.starts_on && banner.starts_on > today) return false
  if (banner.ends_on && banner.ends_on < today) return false
  return true
}

export function todayInIndia(now = Date.now()) {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function audienceMatches(audience: BannerAudience, surface: 'public' | 'portal') {
  return audience === 'both' || audience === surface
}
