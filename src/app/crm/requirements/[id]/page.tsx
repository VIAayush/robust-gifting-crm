import { createClient } from '@/lib/supabase/server'
import { PRODUCT_EMBED_COLUMNS } from '@/lib/products/costs'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { purposeLabel } from '@/lib/requirements/purpose'
import { BackButton } from '@/components/ui/back-button'
import { formatCurrency, formatDate, formatUnits, isUuid } from '@/lib/utils'
import { ClipboardList, Building2, User, Calendar, DollarSign, Package } from 'lucide-react'
import { requireStaff } from '@/lib/auth'
import { updateRequirementForm, removeRequirement, createQuotationFromRequirement } from '../actions'
import { WorkflowPanel } from './workflow-panel'
import { STAGES, TONE_CLASSES, type WorkflowStage, budgetStatus, isWorkflowStage, selectionTotals, staffCanCreateQuotation, totalBudget } from '@/lib/requirements/workflow'
import { ConfirmAction } from '@/components/ui/confirm-action'
import { asFormAction } from '@/lib/form-action'
import { MobileSheetSelect, SheetDateField } from '@/components/ui/mobile-filter-sheet'

type EventRow = {
  id: string
  actor_kind: string
  to_stage: string | null
  note: string | null
  visible_to_client: boolean
  created_at: string
  actor: { full_name: string | null } | { full_name: string | null }[] | null
}
type SelectionRow = { quantity: number | null; unit_price_snapshot: number | null; product: { price: number | null } | { price: number | null }[] | null }

export default async function RequirementDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; removed?: string }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { tab = 'overview', removed } = await searchParams
  await requireStaff(['admin', 'sales', 'management'])
  const supabase = await createClient()

  const [
    { data: req },
    { data: products },
    { data: quotations },
    { data: activities },
    { data: events }
  ] = await Promise.all([
    supabase
      .from('requirements')
      .select(`
        *,
        company:companies(id, name),
        contact:contacts(id, full_name, email, phone),
        owner:profiles!requirements_owner_id_fkey(id, full_name)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('requirement_products').select(`*, product:products(${PRODUCT_EMBED_COLUMNS})`).eq('requirement_id', id),
    supabase.from('quotations').select('*').eq('requirement_id', id).order('created_at', { ascending: false }),
    supabase.from('activities').select('*, created_by_profile:profiles!activities_created_by_fkey(id, full_name)').eq('related_type', 'requirement').eq('related_id', id).order('created_at', { ascending: false }),
    supabase.from('requirement_events').select('id, actor_kind, from_stage, to_stage, note, visible_to_client, created_at, actor:profiles(full_name)').eq('requirement_id', id).order('created_at', { ascending: false })
  ])

  if (!req) notFound()

  const stageKey: WorkflowStage | null = isWorkflowStage(req.workflow_stage) ? req.workflow_stage : null
  const budgetAll = totalBudget(req.budget, req.quantity)
  const selection = selectionTotals(
    ((products || []) as unknown as SelectionRow[]).map((item) => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product
      return { quantity: Number(item.quantity) || 0, unitPrice: item.unit_price_snapshot ?? product?.price ?? null }
    }),
  )
  const selectionStatus = budgetStatus(selection.total, budgetAll)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <BackButton href="/crm/requirements" label="Back to Requirements" />
      {removed === 'archived' && (
        <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
          This requirement cannot be permanently deleted because it has quotations or orders. It was closed instead.
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-[#9C7A33]/10 text-[#9C7A33] rounded-lg">
              <ClipboardList size={16} />
            </span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Brief</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 capitalize">
              {req.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{req.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Company: <Link href={`/crm/companies/${(req.company as any)?.id}`} className="font-semibold text-[#9C7A33] hover:underline">{(req.company as any)?.name}</Link> ? 
            Owner: <span className="font-medium text-gray-700">{(req.owner as any)?.full_name || 'Unassigned'}</span>
          </p>
        </div>

        <div className="flex items-center gap-4 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Total Budget</p>
            <p className="text-xl font-bold text-[#9C7A33]">{formatCurrency(req.budget)}</p>
          </div>
          <div className="border-l border-purple-200 pl-4">
            <p className="text-[10px] uppercase font-bold text-gray-400">Target Qty</p>
            <p className="text-xl font-bold text-gray-900">{formatUnits(req.quantity)}</p>
          </div>
        </div>
        <ConfirmAction
          title="Remove requirement?"
          confirmLabel="Delete"
          action={asFormAction(removeRequirement)}
          hiddenFields={{ id: req.id }}
          description={<p>Requirement: <span className="font-semibold">{req.name}</span>. If quotations or orders exist it will be closed instead of deleted.</p>}
        >
          Delete
        </ConfirmAction>
      </div>

      {stageKey ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-xs shadow-sm">
            <span className={`rounded-full px-3 py-1 font-semibold ${TONE_CLASSES[STAGES[stageKey].tone]}`}>{STAGES[stageKey].label}</span>
            {req.decision_note ? <span className="text-gray-600">Last decision note: {req.decision_note}</span> : null}
            {products && products.length > 0 ? (
              <span className="ml-auto text-gray-600">
                Selection {formatCurrency(selection.total)}
                {budgetAll ? ` of ${formatCurrency(budgetAll)} (${selectionStatus === 'over' ? 'above budget' : selectionStatus === 'near' ? 'near budget' : 'within budget'})` : ''}
              </span>
            ) : null}
          </div>
          <WorkflowPanel requirementId={req.id} stage={stageKey} />
          {staffCanCreateQuotation(stageKey) ? (
            <form action={asFormAction(createQuotationFromRequirement)} className="flex flex-col gap-2 rounded-2xl border border-green-200 bg-green-50/50 p-4 text-xs sm:flex-row sm:items-center">
              <input type="hidden" name="requirement_id" value={req.id} />
              <span className="flex-1 text-gray-700">The selection is approved. Prepare the quotation from the approved items.</span>
              <button className="min-h-10 rounded-lg bg-[#9C7A33] px-4 font-semibold text-white">Create quotation draft</button>
            </form>
          ) : null}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-xs shadow-sm">
            <h3 className="border-b pb-2 text-sm font-bold text-gray-900">Workflow history</h3>
            <ol className="mt-3 space-y-3">
              {((events || []) as unknown as EventRow[]).map((event) => {
                const actor = Array.isArray(event.actor) ? event.actor[0] : event.actor
                const toStage = event.to_stage
                return (
                <li key={event.id} className="border-l-2 border-gray-200 pl-3">
                  <p className="font-semibold text-gray-900">
                    {isWorkflowStage(toStage) ? STAGES[toStage].label : 'Internal note'}
                    <span className="ml-2 font-normal text-gray-400">
                      {event.actor_kind === 'client' ? 'Client' : event.actor_kind === 'staff' ? actor?.full_name || 'Staff' : 'System'} · {formatDate(event.created_at)}
                    </span>
                    {!event.visible_to_client ? <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">Internal</span> : null}
                  </p>
                  {event.note ? <p className="mt-0.5 whitespace-pre-line text-gray-600">{event.note}</p> : null}
                </li>
                )
              })}
              {(!events || events.length === 0) && <li className="text-gray-400">No workflow activity yet.</li>}
            </ol>
          </div>
        </div>
      ) : null}

      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          {['overview', 'products', 'quotations', 'activities'].map((t) => (
            <Link
              key={t}
              href={`?tab=${t}`}
              className={`pb-3 text-xs font-semibold capitalize transition-colors border-b-2 ${
                tab === t ? 'border-[#9C7A33] text-[#9C7A33]' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 text-xs space-y-3">
              <h3 className="font-bold text-sm text-gray-900 pb-2 border-b">Brief Description & Objectives</h3>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {req.description || 'No detailed description provided.'}
              </p>
              <form action={asFormAction(updateRequirementForm)} className="grid md:grid-cols-2 gap-3 pt-3 border-t">
                <input type="hidden" name="id" value={req.id} />
                <input name="name" required defaultValue={req.name} className="border rounded-lg px-2 py-2 md:col-span-2" />
                <input name="quantity" type="number" min="1" defaultValue={req.quantity || 1} className="border rounded-lg px-2 py-2" />
                <input name="budget" type="number" step="0.01" defaultValue={req.budget || ''} placeholder="Budget" className="border rounded-lg px-2 py-2" />
                <input name="purpose" defaultValue={req.purpose || ''} placeholder="Purpose" className="border rounded-lg px-2 py-2" />
                <input name="delivery_city" defaultValue={req.delivery_city || ''} placeholder="Delivery city" className="border rounded-lg px-2 py-2" />
                <input name="payment_terms" defaultValue={req.payment_terms || ''} placeholder="Payment terms" className="min-h-11 rounded-lg border px-2 py-2" />
                <SheetDateField name="deadline" label="Deadline" defaultValue={req.deadline || ''} />
                <MobileSheetSelect
                  name="status"
                  label="Status"
                  defaultValue={req.status}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'active', label: 'Active' },
                    { value: 'quoted', label: 'Quoted' },
                    { value: 'won', label: 'Won' },
                    { value: 'lost', label: 'Lost' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
                <textarea name="description" rows={3} defaultValue={req.description || ''} className="rounded-lg border px-2 py-2 md:col-span-2" />
                <button className="min-h-11 rounded-lg bg-[#9C7A33] px-3 py-2 font-semibold text-white md:col-span-2">Save requirement</button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 text-xs space-y-3">
              <h3 className="font-bold text-sm text-gray-900 pb-2 border-b">Delivery & Commercial Terms</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-gray-500 block mb-0.5">Purpose / Occasion:</span> <span className="font-semibold text-gray-900">{purposeLabel(req.purpose) || '—'}</span></div>
                <div><span className="text-gray-500 block mb-0.5">Delivery City:</span> <span className="font-semibold text-gray-900">{req.delivery_city || '—'}</span></div>
                <div><span className="text-gray-500 block mb-0.5">Payment Terms:</span> <span className="font-semibold text-gray-900">{req.payment_terms || 'Standard'}</span></div>
                <div><span className="text-gray-500 block mb-0.5">Target Deadline:</span> <span className="font-semibold text-red-600">{formatDate(req.deadline)}</span></div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 text-xs space-y-3">
              <h3 className="font-bold text-sm text-gray-900 pb-2 border-b">Contact Person</h3>
              <div><span className="text-gray-500 block mb-0.5">Name:</span> <span className="font-semibold text-gray-900">{(req.contact as any)?.full_name || '—'}</span></div>
              <div><span className="text-gray-500 block mb-0.5">Email:</span> {(req.contact as any)?.email || '—'}</div>
              <div><span className="text-gray-500 block mb-0.5">Phone:</span> {(req.contact as any)?.phone || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3.5 font-semibold text-gray-500">Shortlisted Product</th>
                <th className="p-3.5 font-semibold text-gray-500 text-right">Qty requested</th>
                <th className="p-3.5 font-semibold text-gray-500">Notes</th>
                <th className="p-3.5 font-semibold text-gray-500 text-right">Price</th>
                <th className="p-3.5 font-semibold text-gray-500 text-right">MOQ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products?.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="p-3.5">
                    <Link href={`/crm/products/${item.product?.id}`} className="font-bold text-gray-900 hover:text-[#9C7A33]">
                      {item.product?.name || 'Product'}
                    </Link>
                    <div className="text-gray-400 font-mono text-[10px]">{item.product?.sku}</div>
                  </td>
                  <td className="p-3.5 text-right font-semibold text-gray-900">{formatUnits(item.quantity ?? 1)}</td>
                  <td className="p-3.5 text-gray-600">{item.notes || '—'}</td>
                  <td className="p-3.5 text-right font-bold text-gray-900">{formatCurrency(item.product?.price)}</td>
                  <td className="p-3.5 text-right text-gray-600">{formatUnits(item.product?.moq ?? 1)}</td>
                </tr>
              ))}
              {(!products || products.length === 0) && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">No products attached to this brief.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'quotations' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-sm">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3.5 font-semibold text-gray-500">Quote #</th>
                <th className="p-3.5 font-semibold text-gray-500">Total</th>
                <th className="p-3.5 font-semibold text-gray-500">Status</th>
                <th className="p-3.5 font-semibold text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations?.map((q: any) => (
                <tr key={q.id} className="hover:bg-gray-50/50">
                  <td className="p-3.5">
                    <Link href={`/crm/quotations/${q.id}`} className="font-bold text-[#9C7A33] hover:underline">
                      {q.quotation_number}
                    </Link>
                  </td>
                  <td className="p-3.5 font-bold text-gray-900">{formatCurrency(q.total)}</td>
                  <td className="p-3.5 capitalize">{q.status}</td>
                  <td className="p-3.5 text-gray-500">{formatDate(q.created_at)}</td>
                </tr>
              ))}
              {(!quotations || quotations.length === 0) && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400">No quotations generated yet for this requirement.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activities' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="space-y-3 text-xs">
            {activities?.map((act: any) => (
              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between font-bold text-gray-900 mb-1">
                  <span className="uppercase text-[#9C7A33]">{act.type}</span>
                  <span className="text-gray-400 font-normal">{formatDate(act.created_at)}</span>
                </div>
                <p className="text-gray-700">{act.notes}</p>
                <p className="text-[10px] text-gray-400 mt-1">Logged by {(act.created_by_profile as any)?.full_name || 'Team'}</p>
              </div>
            ))}
            {(!activities || activities.length === 0) && (
              <p className="text-gray-400 text-center py-4">No activities logged yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
