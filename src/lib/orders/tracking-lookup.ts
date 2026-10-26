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
