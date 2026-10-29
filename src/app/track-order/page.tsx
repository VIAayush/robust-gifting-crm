import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { TrackForm } from './track-form'
import { parseOrderNumberParam } from '@/lib/orders/tracking-lookup'

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Check the status of your Robust Gifting order with your order number and email.',
  robots: { index: false, follow: false },
}

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  // Only the order number may be pre-filled from the URL (junk is ignored); the email is never read from or put in a URL.
  const { order } = await searchParams
  const initialOrderNumber = parseOrderNumberParam(order)
  return (
    <SiteShell>
      <div className="border-b border-[#E2E8F0] bg-[#F1F4F9]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="store-eyebrow">Order status</p>
          <h1 className="store-section-title mt-2">Track your order.</h1>
        </div>
      </div>
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <TrackForm initialOrderNumber={initialOrderNumber} />
      </div>
    </SiteShell>
  )
}
