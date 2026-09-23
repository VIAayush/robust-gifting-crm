import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { WishlistPageContent } from '@/components/site/wishlist-page-content'

export const metadata: Metadata = {
  title: 'Your Wishlist — Robust Gifting',
  description: 'Gifts you have saved while browsing the catalogue.',
}

export default function WishlistPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <p className="store-eyebrow">Saved for later</p>
        <h1 className="mt-2 font-serif text-3xl text-[#1B2430] sm:text-4xl">Your wishlist</h1>
        <div className="mt-8">
          <WishlistPageContent />
        </div>
      </div>
    </SiteShell>
  )
}
