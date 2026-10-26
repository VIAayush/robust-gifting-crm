import type { Metadata } from 'next'
import { SiteShell } from '@/components/site/site-shell'
import { CatalogueListing, type CatalogueSearchParams } from '@/components/site/catalogue-listing'

export const metadata: Metadata = {
  title: 'Catalogue',
  description: 'Browse the Robust Gifting corporate gifting catalogue.',
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<CatalogueSearchParams> }) {
  return (
    <SiteShell mode="corporate">
      <CatalogueListing mode="corporate" searchParams={await searchParams} />
    </SiteShell>
  )
}
