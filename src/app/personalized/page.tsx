import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { PersonalizedHome } from '@/components/site/personalized-home'

export const metadata: Metadata = {
  title: 'Personalized Gifts — Robust Gifting',
  description: 'Thoughtful, curated gifts for birthdays, anniversaries and every occasion.',
}

export default function PersonalizedPage() {
  return (
    <SiteShell>
      <PersonalizedHome />
    </SiteShell>
  )
}
