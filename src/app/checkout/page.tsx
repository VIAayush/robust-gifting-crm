'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type CartItem, readCart, cartSubtotal, CART_EVENT } from '@/lib/site/cart'
import { formatCurrency } from '@/lib/utils'
import { createCheckout } from './actions'

const field = 'mt-2 w-full border-b border-[#E2E8F0] bg-transparent py-2 text-sm outline-none focus:border-[#9C7A33]'
const label = 'text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]'

export default function CheckoutPage() {
  const router = useRouter()
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/cart" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A33]">
        ← Back to cart
      </Link>
      <h1 className="mt-4 font-serif text-2xl text-[#1B2430] sm:text-3xl">Checkout</h1>
      <p className="mt-2 text-sm text-[#5C6570]">
        Estimated subtotal {formatCurrency(subtotal)} for {items.length} item{items.length === 1 ? '' : 's'} — the
        final amount is confirmed on the next page before payment.
      </p>

      <form
        className="mt-8 space-y-8"
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setPending(true)
          const form = new FormData(event.currentTarget)
          const result = await createCheckout(items, {
            fullName: String(form.get('full_name') || ''),
            email: String(form.get('email') || ''),
            phone: String(form.get('phone') || ''),
            addressLine: String(form.get('address_line') || ''),
            city: String(form.get('city') || ''),
            state: String(form.get('state') || ''),
            postalCode: String(form.get('postal_code') || ''),
          })
          setPending(false)
          if (result?.error) {
            setError(result.error)
            return
          }
          if (result?.checkoutId) router.push(`/checkout/${result.checkoutId}/review`)
        }}
      >
        <fieldset className="space-y-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2430]">Customer details</legend>
          <label className="block">
            <span className={label}>Name</span>
            <input required name="full_name" className={field} />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input required type="email" name="email" className={field} />
          </label>
          <label className="block">
            <span className={label}>Phone</span>
            <input required name="phone" className={field} />
          </label>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B2430]">Delivery details</legend>
          <label className="block">
            <span className={label}>Address</span>
            <textarea required name="address_line" rows={2} className={field} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>City</span>
              <input required name="city" className={field} />
            </label>
            <label className="block">
              <span className={label}>State</span>
              <input name="state" className={field} />
            </label>
          </div>
          <label className="block max-w-[10rem]">
            <span className={label}>Postal code</span>
            <input name="postal_code" className={field} />
          </label>
        </fieldset>

        {error ? <p className="text-sm text-red-800">{error}</p> : null}

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
