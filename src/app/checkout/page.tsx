'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type CartItem, readCart, cartSubtotal, CART_EVENT } from '@/lib/site/cart'
import { formatCurrency } from '@/lib/utils'
import { createCheckout } from './actions'
import { validateCheckoutCustomer, type CheckoutCustomer, type CheckoutFieldErrors } from '@/lib/checkout/validation'

const fieldBase = 'mt-2 w-full border-b bg-transparent py-2 text-sm outline-none'
const label = 'text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]'
const DRAFT_KEY = 'giffter.checkout.details'

const EMPTY: CheckoutCustomer = { fullName: '', email: '', phone: '', addressLine: '', city: '', state: '', postalCode: '' }

function fieldClass(hasError: boolean) {
  return `${fieldBase} ${hasError ? 'border-red-500 focus:border-red-600' : 'border-[#E2E8F0] focus:border-[#9C7A33]'}`
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-700">
      {message}
    </p>
  )
}

export default function CheckoutPage() {
  const router = useRouter()
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [error, setError] = useState('')
  // The page renders nothing until hydrated, so reading the saved draft here can't cause a hydration mismatch.
  const [values, setValues] = useState<CheckoutCustomer>(() => {
    if (typeof window === 'undefined') return EMPTY
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
      return saved && typeof saved === 'object' ? { ...EMPTY, ...saved } : EMPTY
    } catch {
      return EMPTY
    }
  })
  const [errors, setErrors] = useState<CheckoutFieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof CheckoutCustomer, boolean>>>({})

  useEffect(() => {
    const sync = () => setItems(readCart())
    sync()
    setHydrated(true)
    window.addEventListener('storage', sync)
    window.addEventListener(CART_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CART_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values))
    } catch {
      // storage unavailable; the form still works
    }
  }, [values, hydrated])

  if (!hydrated) return null

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="font-serif text-xl text-[#1B2430]">Your cart is empty.</p>
        <Link href="/personalized" className="mt-6 inline-flex bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
          Browse personalized gifts
        </Link>
      </div>
    )
  }

  const subtotal = cartSubtotal()
  const unitCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)

  const update = (key: keyof CheckoutCustomer, value: string) => {
    const next = { ...values, [key]: value }
    setValues(next)
    // Once a field has been left (or the form submitted), re-check it as the user types.
    if (touched[key]) {
      const { errors: nextErrors } = validateCheckoutCustomer(next)
      setErrors((prev) => ({ ...prev, [key]: nextErrors[key] }))
    }
  }

  const blur = (key: keyof CheckoutCustomer) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
    const { errors: nextErrors } = validateCheckoutCustomer(values)
    setErrors((prev) => ({ ...prev, [key]: nextErrors[key] }))
  }

  const inputProps = (key: keyof CheckoutCustomer, id: string) => ({
    id,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, e.target.value),
    onBlur: () => blur(key),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${id}-error` : undefined,
    className: fieldClass(Boolean(errors[key])),
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/cart" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]">
        ← Back to cart
      </Link>
      <h1 className="mt-4 font-serif text-2xl text-[#1B2430] sm:text-3xl">Checkout</h1>
      <p className="mt-2 text-sm text-[#5C6570]">
        Estimated subtotal {formatCurrency(subtotal)} for {unitCount} item{unitCount === 1 ? '' : 's'} — the
        final amount is confirmed on the next page before payment.
      </p>

      <form
        noValidate
        className="mt-8 space-y-8"
        onSubmit={async (event) => {
          event.preventDefault()
          if (pendingRef.current) return
          setError('')
          const { errors: clientErrors } = validateCheckoutCustomer(values)
          setTouched({ fullName: true, email: true, phone: true, addressLine: true, city: true, state: true, postalCode: true })
          if (Object.keys(clientErrors).length > 0) {
            setErrors(clientErrors)
            setError('Please fix the highlighted fields.')
            return
          }
          pendingRef.current = true
          setPending(true)
          try {
            const result = await createCheckout(items, values)
            if (result?.error) {
              setError(result.error)
              if (result.fieldErrors) setErrors(result.fieldErrors)
              return
            }
            if (result?.checkoutId) router.push(`/checkout/${result.checkoutId}/review`)
          } catch {
            setError('Something went wrong. Please check your connection and try again.')
          } finally {
            pendingRef.current = false
            setPending(false)
          }
        }}
      >
        <fieldset className="space-y-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2430]">Customer details</legend>
          <div>
            <label htmlFor="co-name" className={label}>
              Full name
            </label>
            <input {...inputProps('fullName', 'co-name')} autoComplete="name" maxLength={80} />
            <FieldError id="co-name-error" message={errors.fullName} />
          </div>
          <div>
            <label htmlFor="co-email" className={label}>
              Email
            </label>
            <input {...inputProps('email', 'co-email')} type="email" inputMode="email" autoComplete="email" maxLength={120} />
            <FieldError id="co-email-error" message={errors.email} />
          </div>
          <div>
            <label htmlFor="co-phone" className={label}>
              Mobile number
            </label>
            <input
              {...inputProps('phone', 'co-phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              placeholder="98765 43210"
            />
            <FieldError id="co-phone-error" message={errors.phone} />
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2430]">Delivery details</legend>
          <div>
            <label htmlFor="co-address" className={label}>
              Address
            </label>
            <textarea {...inputProps('addressLine', 'co-address')} rows={2} autoComplete="street-address" maxLength={300} />
            <FieldError id="co-address-error" message={errors.addressLine} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="co-city" className={label}>
                City
              </label>
              <input {...inputProps('city', 'co-city')} autoComplete="address-level2" maxLength={60} />
              <FieldError id="co-city-error" message={errors.city} />
            </div>
            <div>
              <label htmlFor="co-state" className={label}>
                State
              </label>
              <input {...inputProps('state', 'co-state')} autoComplete="address-level1" maxLength={60} />
              <FieldError id="co-state-error" message={errors.state} />
            </div>
          </div>
          <div className="max-w-[12rem]">
            <label htmlFor="co-pin" className={label}>
              PIN code
            </label>
            <input
              {...inputProps('postalCode', 'co-pin')}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="560001"
            />
            <FieldError id="co-pin-error" message={errors.postalCode} />
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#9C7A33] px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-60 sm:w-auto"
        >
          {pending ? 'Reviewing…' : 'Review order'}
        </button>
      </form>
    </div>
  )
}
