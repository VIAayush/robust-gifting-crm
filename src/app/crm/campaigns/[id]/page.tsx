import { redirect } from 'next/navigation'

export default async function CampaignRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/crm/products/catalogues/${id}`)
}
