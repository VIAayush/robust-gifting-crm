'use client'

import { useState } from 'react'
import { submitCartQuote, submitCartOrder } from '@/app/cart/actions'
import type { CartItem } from '@/lib/site/cart'

const field = 'mt-2 w-full border-b border-[#E2E8F0] bg-transparent py-2 text-sm outline-none focus:border-[#9C7A33]'
const label = 'text-[10px] font-medium uppercase tracking-[0.16em] text-[#5C6570]'

function itemsPayload(items: CartItem[]) {
  return JSON.stringify(items.map((item) => ({ name: item.name, sku: item.sku, quantity: item.quantity, price: item.price })))
}

function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-8 text-center">
      <p className="font-serif text-2xl text-[#1B2430]">Thank you.</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#5C6570]">{children}</p>
    </div>
  )
}

/** Corporate/bulk: submits the whole cart as one quote enquiry — no payment, a person follows up. */
export function CartQuoteForm({ items, onSuccess }: { items: CartItem[]; onSuccess?: () => void }) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  if (success) {
    return (
      <SuccessNote>
        We have received your enquiry for {items.length} item{items.length === 1 ? '' : 's'}. A Robust Gifting account
        manager will follow up with a quotation.
      </SuccessNote>
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        setPending(true)
        const form = new FormData(event.currentTarget)
        form.set('cart_items', itemsPayload(items))
        const result = await submitCartQuote(form)
        setPending(false)
        if (result?.error) {
          setError(result.error)
          return
        }
        setSuccess(true)
        onSuccess?.()
      }}
    >
      <input type="text" name="fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="block">
        <span className={label}>Name</span>
        <input required name="full_name" className={field} />
      </label>
      <label className="block">
        <span className={label}>Work email</span>
        <input required type="email" name="email" className={field} />
      </label>
      <label className="block">
        <span className={label}>Company</span>
        <input required name="company_name" className={field} />
      </label>
      <label className="block">
        <span className={label}>Phone</span>
        <input name="phone" className={field} />
      </label>
      <label className="block">
        <span className={label}>Anything else we should know?</span>
        <textarea name="message" rows={3} className={field} />
      </label>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-w-[12rem] items-center justify-center bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  )
}

/** Personalized: captures the order for staff to confirm and collect payment on — no online payment yet. */
export function CartOrderForm({ items, onSuccess }: { items: CartItem[]; onSuccess?: () => void }) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  if (success) {
    return (
      <SuccessNote>
        We have received your order for {items.length} item{items.length === 1 ? '' : 's'}. Our team will call or
        email you shortly to confirm the total and arrange payment before dispatch.
      </SuccessNote>
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        setPending(true)
        const form = new FormData(event.currentTarget)
        form.set('cart_items', itemsPayload(items))
        const result = await submitCartOrder(form)
        setPending(false)
        if (result?.error) {
          setError(result.error)
          return
        }
        setSuccess(true)
        onSuccess?.()
      }}
    >
      <input type="text" name="fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <p className="text-xs text-[#5C6570]">
        No online payment yet — we will confirm your total and collect payment (UPI, card link or COD, depending on
        your area) before we dispatch.
      </p>
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
      <label className="block">
        <span className={label}>Delivery address</span>
        <textarea required name="delivery_address" rows={3} className={field} />
      </label>
      <label className="block">
        <span className={label}>Gift note / special instructions (optional)</span>
        <textarea name="message" rows={2} className={field} />
      </label>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-w-[12rem] items-center justify-center bg-[#9C7A33] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-60"
      >
        {pending ? 'Placing order…' : 'Place Order'}
      </button>
    </form>
  )
}
