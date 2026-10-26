export type CheckoutCustomer = {
  fullName: string
  email: string
  phone: string
  addressLine: string
  city: string
  state: string
  postalCode: string
}

export type CheckoutFieldErrors = Partial<Record<keyof CheckoutCustomer, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Accepts "+91 98765 43210", "098765-43210", "919876543210" etc. and returns the
 * 10-digit Indian mobile number, or null if it isn't one (must start 6-9).
 */
export function normalizeIndianMobile(raw: string): string | null {
  let digits = String(raw || '').replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  digits = digits.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

export function validateCheckoutCustomer(input: CheckoutCustomer): { errors: CheckoutFieldErrors; value: CheckoutCustomer } {
  const errors: CheckoutFieldErrors = {}
  const fullName = String(input.fullName || '').trim().replace(/\s+/g, ' ')
  const email = String(input.email || '').trim().toLowerCase()
  const addressLine = String(input.addressLine || '').trim()
  const city = String(input.city || '').trim()
  const state = String(input.state || '').trim()
  const postalCode = String(input.postalCode || '').replace(/\s/g, '')

  if (fullName.length < 2) errors.fullName = 'Enter your full name.'
  else if (fullName.length > 80) errors.fullName = 'Keep your name under 80 characters.'
  else if (!/[A-Za-zऀ-ॿ]/.test(fullName)) errors.fullName = 'Enter a valid name.'

  if (!email) errors.email = 'Enter your email address.'
  else if (email.length > 120 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, like name@example.com.'

  const phone = normalizeIndianMobile(input.phone)
  if (!String(input.phone || '').trim()) errors.phone = 'Enter your mobile number.'
  else if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number.'

  if (addressLine.length < 10) errors.addressLine = 'Enter your full delivery address (house/flat, street, area).'
  else if (addressLine.length > 300) errors.addressLine = 'Keep the address under 300 characters.'

  if (city.length < 2) errors.city = 'Enter your city.'
  else if (city.length > 60) errors.city = 'Keep the city under 60 characters.'

  if (state.length > 60) errors.state = 'Keep the state under 60 characters.'

  if (!postalCode) errors.postalCode = 'Enter your 6-digit PIN code.'
  else if (!/^[1-9]\d{5}$/.test(postalCode)) errors.postalCode = 'PIN code must be 6 digits.'

  return {
    errors,
    value: { fullName, email, phone: phone || '', addressLine, city, state, postalCode },
  }
}
