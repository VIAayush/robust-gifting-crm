import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { CatalogueListing, type CatalogueSearchParams } from '@/components/site/catalogue-listing'

export const metadata: Metadata = {
  title: 'Shop Personalized Gifts',
  description: 'Buy personalized gifts online from Robust Gifting.',
}

export default async function PersonalizedCataloguePage({ searchParams }: { searchParams: Promise<CatalogueSearchParams> }) {
  return (
    <SiteShell mode="personalized">
      <CatalogueListing mode="personalized" searchParams={await searchParams} />
    </SiteShell>
  )
}
