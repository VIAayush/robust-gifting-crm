import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { format } from 'date-fns'
import { ClipboardList } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { purposeLabel } from '@/lib/requirements/purpose'
import { STAGES, TONE_CLASSES, clientActionNeeded, clientStageText, isWorkflowStage, originFromCreationEvent, type RequirementOrigin } from '@/lib/requirements/workflow'

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  active: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  quoted: { label: 'Quotation sent', className: 'bg-yellow-100 text-yellow-800' },
  won: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  lost: { label: 'Not proceeding', className: 'bg-gray-100 text-gray-600' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600' },
}

function statusFor(req: { status: string | null; workflow_stage: string | null }, origin: RequirementOrigin) {
  if (isWorkflowStage(req.workflow_stage)) {
    const stage = STAGES[req.workflow_stage]
    return { label: clientStageText(req.workflow_stage, origin).label, className: TONE_CLASSES[stage.tone] }
  }
  return STATUS[req.status || ''] || { label: req.status || '—', className: 'bg-gray-100 text-gray-700' }
}

function formatDay(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd MMM yyyy')
}

type RequirementRow = {
  id: string
  name: string
  purpose: string | null
  status: string | null
  workflow_stage: string | null
  budget: number | null
  quantity: number | null
  deadline: string | null
  delivery_city: string | null
  created_at: string
}

export default async function PortalRequirementsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams
  const supabase = await createClient()
  const { data: companyId } = await supabase.rpc('client_company_id')

  // RLS already limits this to the caller's own company.
  const { data, error } = await supabase
    .from('requirements')
    .select('id, name, purpose, status, workflow_stage, budget, quantity, deadline, delivery_city, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  const requirements = (data || []) as RequirementRow[]

  // requirement_products is staff-only under RLS; count lines for these
  // (already company-scoped) requirement ids with the service role.
  const itemCounts = new Map<string, number>()
  const admin = createAdminClient()
  if (admin && requirements.length) {
    const { data: lines } = await admin
      .from('requirement_products')
      .select('requirement_id')
      .in('requirement_id', requirements.map((r) => r.id))
    for (const line of lines || []) {
      const id = line.requirement_id as string
      itemCounts.set(id, (itemCounts.get(id) || 0) + 1)
    }
  }

  // Who started each requirement (visible history rows only), so "from your account manager" reads differently
  // from "you submitted this".
  const origins = new Map<string, RequirementOrigin>()
  if (requirements.length) {
    const { data: starts } = await supabase
      .from('requirement_events')
      .select('requirement_id, actor_kind')
      .is('from_stage', null)
      .in('requirement_id', requirements.map((r) => r.id))
    for (const row of starts || []) origins.set(row.requirement_id as string, originFromCreationEvent(row.actor_kind as string))
  }
  const originOf = (id: string): RequirementOrigin => origins.get(id) ?? 'client'
  const awaitingResponse = requirements.filter((r) => clientActionNeeded(r.workflow_stage))

  const justCreated = created ? requirements.find((r) => r.id === created) : null

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:mb-8 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My Requirements</h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">Track the gifting requirements your team has shared with us.</p>
        </div>
        <Link
          href="/portal/requirements/new"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] sm:w-auto"
        >
          Create New Requirement
        </Link>
      </div>

      {justCreated ? (
        <div role="status" className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>{justCreated.name}</strong> was submitted. Our team will review it and you will be notified of the decision.
        </div>
      ) : null}

      {awaitingResponse.length > 0 ? (
        <section aria-labelledby="awaiting-response" className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <h2 id="awaiting-response" className="text-sm font-semibold text-gray-900">
            Awaiting your response ({awaitingResponse.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {awaitingResponse.map((req) => {
              const text = isWorkflowStage(req.workflow_stage) ? clientStageText(req.workflow_stage, originOf(req.id)) : null
              return (
                <li key={req.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{req.name}</p>
                    <p className="text-xs text-gray-600">{text?.label}</p>
                  </div>
                  <Link
                    href={`/portal/requirements/${req.id}`}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]"
                  >
                    Review and respond
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t load your requirements right now. Please refresh the page.
        </div>
      ) : requirements.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No requirements yet</p>
          <p className="mt-1 text-sm text-gray-500">Share what you need and we&apos;ll prepare a custom quotation.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {requirements.map((req) => {
              const status = statusFor(req, originOf(req.id))
              return (
                <article key={req.id} className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/portal/requirements/${req.id}`} className="block truncate text-sm font-semibold text-gray-900 hover:text-[#9C7A33]">{req.name}</Link>
                      <p className="mt-0.5 text-xs text-gray-500">{purposeLabel(req.purpose) || '—'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-gray-400">Budget/unit</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">{req.budget ? formatCurrency(req.budget) : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-gray-400">Quantity</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">{req.quantity ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-gray-400">Products</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">{itemCounts.get(req.id) || 0}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wider text-gray-400">Required by</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">{formatDay(req.deadline)}</dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="border-b border-gray-200 bg-gray-50 text-gray-900">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Name</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Budget/Unit</th>
                    <th className="px-6 py-4 font-semibold">Quantity</th>
                    <th className="px-6 py-4 font-semibold">Products</th>
                    <th className="px-6 py-4 font-semibold">Required by</th>
                    <th className="px-6 py-4 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requirements.map((req) => {
                    const status = statusFor(req, originOf(req.id))
                    return (
                      <tr key={req.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <Link href={`/portal/requirements/${req.id}`} className="hover:text-[#9C7A33]">{req.name}</Link>
                          <div className="mt-1 text-xs font-normal text-gray-500">
                            {purposeLabel(req.purpose) || '—'}
                            {req.delivery_city ? ` · ${req.delivery_city}` : ''}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-6 py-4">{req.budget ? formatCurrency(req.budget) : '—'}</td>
                        <td className="px-6 py-4">{req.quantity ?? '—'}</td>
                        <td className="px-6 py-4">{itemCounts.get(req.id) || 0}</td>
                        <td className="px-6 py-4">{formatDay(req.deadline)}</td>
                        <td className="px-6 py-4">{formatDay(req.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
