import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { BackButton } from '@/components/ui/back-button'
import { formatCurrency } from '@/lib/utils'
import { purposeLabel } from '@/lib/requirements/purpose'
import { STAGES, TONE_CLASSES, clientStageText, isWorkflowStage, originFromCreationEvent, totalBudget } from '@/lib/requirements/workflow'
import { clientLineNote } from '@/lib/orders/item-notes'
import { RequirementNotes, type NoteSource } from '@/components/requirements/requirement-notes'
import { RequirementActions } from './requirement-actions'
import { SelectionPanel, type SelectionLineProp, type CatalogueResult } from './selection-panel'

function formatDay(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd MMM yyyy')
}

export default async function PortalRequirementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; q?: string }>
}) {
  const { id } = await params
  const { created, q } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const { data: companyId } = await supabase.rpc('client_company_id')
  // RLS and the company filter both apply: another company's id returns nothing.
  const { data: requirement } = await supabase
    .from('requirements')
    .select(
      'id, name, purpose, description, budget, quantity, deadline, delivery_city, status, workflow_stage, decision_note, submitted_at, created_at',
    )
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!requirement) notFound()

  const stageKey = isWorkflowStage(requirement.workflow_stage) ? requirement.workflow_stage : null
  const stage = stageKey ? STAGES[stageKey] : null
  const budgetTotal = totalBudget(requirement.budget, requirement.quantity)

  // Only events marked visible to the client are returned (RLS), so internal notes never reach this page.
  const [{ data: events }, { data: lines }, { data: quotations }] = await Promise.all([
    supabase
      .from('requirement_events')
      .select('id, actor_kind, from_stage, to_stage, note, created_at')
      .eq('requirement_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('requirement_products').select('product_id, quantity, notes').eq('requirement_id', id),
    supabase
      .from('quotations')
      .select('id, quotation_number, status')
      .eq('requirement_id', id)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .order('created_at', { ascending: false }),
  ])

  const origin = originFromCreationEvent((events || []).find((event) => event.from_stage === null)?.actor_kind as string | undefined)
  const stageText = stageKey ? clientStageText(stageKey, origin) : null

  const productIds = (lines || []).map((l) => l.product_id as string)
  const { data: lineProducts } = productIds.length
    ? await supabase.from('client_products').select('id, name, sku, image_url, price, moq').in('id', productIds)
    : { data: [] }
  const productById = new Map((lineProducts || []).map((p) => [p.id as string, p]))
  const selection: SelectionLineProp[] = (lines || []).flatMap((l) => {
    const p = productById.get(l.product_id as string)
    if (!p) return []
    return [
      {
        product_id: p.id as string,
        name: p.name as string,
        sku: (p.sku as string | null) || null,
        image_url: (p.image_url as string | null) || null,
        unit_price: Number(p.price),
        moq: Number(p.moq) || 0,
        quantity: Number(l.quantity),
        notes: (l.notes as string | null) || '',
      },
    ]
  })

  // The latest note from each side (events are newest first); older ones stay in History.
  const latestNote = (kind: 'client' | 'staff') => (events || []).find((event) => event.actor_kind === kind && String(event.note || '').trim())
  const noteSources: NoteSource[] = []
  const clientEvent = latestNote('client')
  const staffEvent = latestNote('staff')
  if (clientEvent) noteSources.push({ by: 'Your note', text: String(clientEvent.note), when: format(new Date(clientEvent.created_at as string), 'dd MMM yyyy, HH:mm') })
  if (staffEvent) noteSources.push({ by: 'Message from Robust Gifting', text: String(staffEvent.note), when: format(new Date(staffEvent.created_at as string), 'dd MMM yyyy, HH:mm') })

  // Product search for the selection panel; only products visible to this company.
  const canSelect = stageKey === 'client_confirmed' || stageKey === 'selection_changes_requested'
  let results: CatalogueResult[] = []
  if (canSelect) {
    const term = String(q || '').trim().slice(0, 60).replace(/[%,()]/g, ' ')
    let query = supabase.from('client_products').select('id, name, sku, image_url, price, moq').order('name').limit(24)
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
    const { data } = await query
    results = (data || []).map((p) => ({
      product_id: p.id as string,
      name: p.name as string,
      sku: (p.sku as string | null) || null,
      image_url: (p.image_url as string | null) || null,
      unit_price: Number(p.price),
      moq: Number(p.moq) || 0,
    }))
  }

  return (
    <div className="space-y-6">
      <BackButton href="/portal/requirements" label="Requirements" />

      {created ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Your requirement was submitted. Our team will review it and you will be notified here and by email.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{requirement.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {purposeLabel(requirement.purpose) || '—'}
            {requirement.delivery_city ? ` · ${requirement.delivery_city}` : ''}
          </p>
        </div>
        {stage ? (
          <span className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[stage.tone]}`}>
            {stageText?.label}
          </span>
        ) : null}
      </div>

      {stage ? <p className="rounded-lg bg-[#F5F7FA] p-3 text-sm text-gray-700">{stageText?.hint}</p> : null}

      {requirement.decision_note && (stageKey === 'changes_requested' || stageKey === 'admin_rejected' || stageKey === 'selection_changes_requested') ? (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="text-xs font-semibold uppercase tracking-wider">Message from our team</p>
          <p className="mt-1 whitespace-pre-line">{requirement.decision_note}</p>
        </div>
      ) : null}

      <RequirementNotes
        notes={noteSources}
        productNotes={selection.flatMap((line) => (clientLineNote(line.notes) ? [{ name: line.name, note: clientLineNote(line.notes) as string }] : []))}
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-gray-400">Budget / unit</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{requirement.budget ? formatCurrency(requirement.budget) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-gray-400">Quantity</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{requirement.quantity ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-gray-400">Total budget</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{budgetTotal ? formatCurrency(budgetTotal) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-gray-400">Required by</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{formatDay(requirement.deadline)}</dd>
        </div>
        {requirement.description ? (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[10px] uppercase tracking-wider text-gray-400">Description</dt>
            <dd className="mt-0.5 whitespace-pre-line text-gray-700">{requirement.description}</dd>
          </div>
        ) : null}
      </dl>

      {stageKey ? (
        <RequirementActions
          requirement={{
            id: requirement.id as string,
            stage: stageKey,
            description: requirement.description || '',
            budget: requirement.budget === null ? '' : String(requirement.budget),
            quantity: requirement.quantity === null ? '' : String(requirement.quantity),
            deadline: requirement.deadline || '',
            delivery_city: requirement.delivery_city || '',
            origin,
          }}
        />
      ) : null}

      {stageKey &&
      (canSelect || stageKey === 'selection_submitted' || stageKey === 'selection_approved' || selection.length > 0) ? (
        <SelectionPanel
          requirementId={requirement.id as string}
          stage={stageKey}
          budgetTotal={budgetTotal}
          initialLines={selection}
          results={results}
          searchTerm={String(q || '')}
        />
      ) : null}

      {(quotations || []).length > 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h2 className="font-serif text-lg">Quotation</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(quotations || []).map((qt) => (
              <li key={qt.id as string}>
                <a className="font-medium text-[#9C7A33] hover:underline" href={`/portal/quotations/${qt.id}`}>
                  {qt.quotation_number as string}
                </a>
                <span className="ml-2 text-gray-500">{String(qt.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="font-serif text-lg">History</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {(events || []).map((event) => {
            const to = isWorkflowStage(event.to_stage) ? clientStageText(event.to_stage, origin).label : 'Submitted'
            return (
              <li key={event.id as string} className="border-l-2 border-[#E2E8F0] pl-3">
                <p className="font-medium text-gray-900">
                  {to}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {event.actor_kind === 'client' ? 'You' : event.actor_kind === 'staff' ? 'Robust Gifting' : 'System'} ·{' '}
                    {format(new Date(event.created_at as string), 'dd MMM yyyy, HH:mm')}
                  </span>
                </p>
                {event.note ? <p className="mt-0.5 whitespace-pre-line text-gray-600">{event.note as string}</p> : null}
              </li>
            )
          })}
          {(events || []).length === 0 ? <li className="text-gray-500">No activity yet.</li> : null}
        </ol>
      </div>
    </div>
  )
}
