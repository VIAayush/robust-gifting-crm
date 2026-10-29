/** Input rules for the public order-tracking form (shared by the server action and unit tests). */

export function normalizeOrderNumber(raw: string): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidTrackingLookup(orderNumberRaw: string, emailRaw: string): { orderNumber: string; email: string } | null {
  const orderNumber = normalizeOrderNumber(orderNumberRaw)
  const email = String(emailRaw || '').trim().toLowerCase()
  if (orderNumber.length < 3 || orderNumber.length > 40 || !/^[A-Z0-9-_/]+$/.test(orderNumber)) return null
  if (email.length > 254 || !EMAIL_RE.test(email)) return null
  return { orderNumber, email }
}

const ORDER_NUMBER_RE = /^[A-Z0-9-_/]+$/

/**
 * Pre-fill value for the tracking form from a `?order=` query parameter. Returns the normalised order number, or ''
 * when the parameter is missing, repeated, too long/short or contains anything that is not an order-number character.
 * Only the order number is ever pre-filled; the email must always be typed by the customer.
 */
export function parseOrderNumberParam(raw: string | string[] | undefined | null): string {
  if (typeof raw !== 'string') return ''
  const orderNumber = normalizeOrderNumber(raw)
  if (orderNumber.length < 3 || orderNumber.length > 40 || !ORDER_NUMBER_RE.test(orderNumber)) return ''
  return orderNumber
}
