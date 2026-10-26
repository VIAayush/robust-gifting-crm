import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isClientPortalUser } from '@/lib/auth/client-guard'

// The checkout pages are client components or per-order pages, so the title
// lives here. Checkout URLs are per-customer - keep them out of search indexes.
export const metadata: Metadata = {
  title: 'Checkout — Robust Gifting',
  robots: { index: false, follow: false },
}

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  // B2B client users have no direct checkout; send them to their portal.
  if (await isClientPortalUser()) redirect('/portal/catalogue')
  return children
}
