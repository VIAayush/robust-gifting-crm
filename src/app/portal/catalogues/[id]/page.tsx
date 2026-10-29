import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, isUuid } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { isMissingTable, type ResponseItem } from '@/lib/catalogues/responses'
import { CatalogueSelection, type ExistingResponse, type OfferingCard } from './catalogue-selection'

export default async function PortalCatalogueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()

  // RLS: only a catalogue published to this client's company is returned, and
  // only the products that company is allowed to see. Client-facing columns only.
  const { data: catalogue } = await supabase
    .from('campaigns')
    .select('id, name, occasion, description, budget_per_employee')
    .eq('id', id)
    .maybeSingle()
  if (!catalogue) notFound()

  const [{ data: offerings }, { data: companyId }] = await Promise.all([
    supabase
      .from('campaign_products')
      .select('id, product_id, display_name, client_description, client_image_url, selling_price, moq')
      .eq('campaign_id', id)
      .eq('visibility', 'published')
      .order('display_order'),
    supabase.rpc('client_company_id'),
  ])
  const items = offerings || []

  // The company's latest response to this catalogue (row-level security: only their own company's rows).
  let existing: ExistingResponse = null
  let responsesAvailable = true
  const { data: responseRows, error: responseError } = await supabase
    .from('catalogue_responses')
    .select('status, comment, items, revision, submitted_at, processed_at, requirement_id')
    .eq('campaign_id', id)
    .eq('company_id', companyId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (responseError) {
    responsesAvailable = !isMissingTable(responseError)
    if (!isMissingTable(responseError)) console.error('[portal] catalogue response read failed', responseError.message)
  }
  const latest = responseRows?.[0]
  if (latest) {
    existing = {
      status: latest.status as 'submitted' | 'processed',
      comment: (latest.comment as string | null) || '',
      submittedAt: latest.submitted_at as string,
      processedAt: (latest.processed_at as string | null) || null,
      requirementId: (latest.requirement_id as string | null) || null,
      revision: Number(latest.revision) || 1,
      items: ((latest.items as ResponseItem[]) || []).map((i) => ({ campaign_product_id: i.campaign_product_id, quantity: i.quantity, notes: i.notes })),
    }
  }

  const cards: OfferingCard[] = items.map((item) => ({
    id: item.id as string,
    product_id: item.product_id as string,
    name: (item.display_name as string) || 'Gift',
    description: (item.client_description as string | null) || null,
    image_url: (item.client_image_url as string | null) || null,
    price: Number(item.selling_price),
    moq: Number(item.moq) || 1,
  }))

  return (
    <div className="space-y-6">
      <BackButton href="/portal/catalogues" label="Back to catalogues" className="min-h-10" />

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {catalogue.occasion ? <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{catalogue.occasion}</p> : null}
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{catalogue.name}</h1>
          {catalogue.description ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-gray-600">{catalogue.description}</p> : null}
          <p className="mt-2 text-xs text-gray-500">
            {items.length} gift{items.length === 1 ? '' : 's'}
            {Number(catalogue.budget_per_employee) > 0 ? ` · around ${formatCurrency(catalogue.budget_per_employee)} per person` : ''}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          The gifts in this catalogue aren&apos;t available yet. Please check back soon.
        </div>
      ) : (
        <CatalogueSelection
          campaignId={catalogue.id as string}
          catalogueName={catalogue.name as string}
          offerings={cards}
          existing={existing}
          responsesAvailable={responsesAvailable}
        />
      )}
    </div>
  )
}
