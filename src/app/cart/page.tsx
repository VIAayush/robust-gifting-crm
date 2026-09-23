import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { CartPageContent } from '@/components/site/cart-page-content'

export const metadata: Metadata = {
  title: 'Your Cart — Robust Gifting',
  description: 'Review your gifts, then request a bulk quote or place an order.',
}

export default function CartPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <p className="store-eyebrow">Review</p>
        <h1 className="mt-2 font-serif text-3xl text-[#1B2430] sm:text-4xl">Your cart</h1>
        <div className="mt-8">
          <CartPageContent />
        </div>
      </div>
    </SiteShell>
  )
}
