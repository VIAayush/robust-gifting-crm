import type { Metadata } from 'next'

// The checkout pages are client components or per-order pages, so the title
// lives here. Checkout URLs are per-customer - keep them out of search indexes.
export const metadata: Metadata = {
  title: 'Checkout — Robust Gifting',
  robots: { index: false, follow: false },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
