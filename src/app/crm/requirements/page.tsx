import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { purposeLabel } from '@/lib/requirements/purpose'
import { formatCurrency, formatDate, asRows, oneRelation } from '@/lib/utils'
import { STAGES, STAGE_KEYS, TONE_CLASSES, isWorkflowStage, staffStageLabel, waitingOn } from '@/lib/requirements/workflow'
import { REQUIREMENT_LIST_SELECT, STAGE_GROUPS, isStageGroup, loadProductCounts, loadRequirementOrigins } from '@/lib/requirements/list'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-100 text-gray-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800'
}

import { requireStaff, applyOwnerScope } from '@/lib/auth'
import { MobileFilterBar } from '@/components/ui/mobile-filter-sheet'

type ReqCompany = { id: string; name: string }
type ReqOwner = { id: string; full_name: string | null }
type RequirementRow = {
  id: string
  title?: string | null
  name?: string | null
  purpose?: string | null
  budget?: number | null
  quantity?: number | null
  deadline?: string | null
  status?: string | null
  workflow_stage?: string | null
  created_at?: string | null
  submitted_at?: string | null
  company?: ReqCompany | ReqCompany[] | null
  owner?: ReqOwner | ReqOwner[] | null
}

export default async function RequirementsPage(props: { searchParams: Promise<{ status?: string; stage?: string }> }) {
  const profile = await requireStaff()
  const searchParams = await props.searchParams
  const statusFilter = searchParams.status || 'all'
  const stageFilter = searchParams.stage || 'all'
  
  const supabase = await createClient()

  let query = supabase
    .from('requirements')
    .select(REQUIREMENT_LIST_SELECT)
    .order('created_at', { ascending: false })
  query = applyOwnerScope(query, profile)

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  if (isStageGroup(stageFilter)) query = query.in('workflow_stage', STAGE_GROUPS[stageFilter])
  else if (isWorkflowStage(stageFilter)) query = query.eq('workflow_stage', stageFilter)

  const { data: requirements, error } = await query
  const requirementRows = asRows<RequirementRow>(requirements)
  const rowIds = requirementRows.map((r) => r.id)
  const [origins, productCounts] = await Promise.all([loadRequirementOrigins(supabase, rowIds), loadProductCounts(supabase, rowIds)])

  const statuses = ['all', 'active', 'won', 'lost', 'closed']
  const stageOptions = [
    { value: 'all', label: 'All stages' },
    { value: 'needs_review', label: 'Needs my review' },
    { value: 'waiting_client', label: 'Waiting on client' },
    { value: 'ready_to_quote', label: 'Ready to quote' },
    ...STAGE_KEYS.map((key) => ({ value: key, label: STAGES[key].label })),
  ]

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-primary)]">Requirements</h1>
        <Link href="/crm/requirements/new" className="bg-[var(--color-primary)] text-white hover:text-white px-4 py-2 rounded-md hover:opacity-90">
          Add Requirement
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Could not load requirements: {error.message}
        </p>
      ) : null}

      <div className="mb-6 md:hidden">
        <MobileFilterBar
          pathname="/crm/requirements"
          fields={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              emptyLabel: 'All',
              options: statuses.map((status) => ({
                value: status,
                label: status === 'all' ? 'All' : status,
              })),
            },
            {
              key: 'stage',
              label: 'Stage',
              value: stageFilter,
              emptyLabel: 'All stages',
              options: stageOptions,
            },
          ]}
        />
      </div>
      <div className="mb-3 hidden flex-wrap gap-2 md:flex">
        {stageOptions.map((option) => (
          <Link
            key={option.value}
            href={`/crm/requirements?status=${statusFilter}&stage=${option.value}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${stageFilter === option.value ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {option.label}
          </Link>
        ))}
      </div>
      <div className="mb-6 hidden gap-2 border-b md:flex">
        {statuses.map(status => (
          <Link 
            key={status}
            href={`/crm/requirements?status=${status}&stage=${stageFilter}`}
            className={`px-4 py-2 text-sm font-medium capitalize ${statusFilter === status ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {status}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-medium text-gray-500">Name</th>
              <th className="p-4 font-medium text-gray-500">Company</th>
              <th className="p-4 font-medium text-gray-500">Owner</th>
              <th className="p-4 font-medium text-gray-500">Submitted</th>
              <th className="p-4 font-medium text-gray-500">Source</th>
              <th className="p-4 font-medium text-gray-500">Budget</th>
              <th className="p-4 font-medium text-gray-500">Qty</th>
              <th className="p-4 font-medium text-gray-500">Products</th>
              <th className="p-4 font-medium text-gray-500">Deadline</th>
              <th className="p-4 font-medium text-gray-500">Status</th>
              <th className="p-4 font-medium text-gray-500">Workflow stage</th>
              <th className="p-4 font-medium text-gray-500">Waiting on</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requirementRows.map((req: RequirementRow) => {
              const company = oneRelation(req.company)
              const owner = oneRelation(req.owner)
              const origin = origins.get(req.id) ?? 'client'
              const waiting = waitingOn(req.workflow_stage)
              return (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="p-4">
                  <Link href={`/crm/requirements/${req.id}`} className="text-blue-600 hover:underline font-medium">
                    {req.title || req.name}
                  </Link>
                  {purposeLabel(req.purpose) ? (
                    <div className="mt-0.5 text-xs text-gray-500">{purposeLabel(req.purpose)}</div>
                  ) : null}
                </td>
                <td className="p-4">{company?.name || '—'}</td>
                <td className="p-4">{owner?.full_name || 'Unassigned'}</td>
                <td className="p-4 whitespace-nowrap">{formatDate(req.submitted_at || req.created_at)}</td>
                <td className="p-4 text-xs">{isWorkflowStage(req.workflow_stage) && origin === 'client' ? 'Client portal' : 'Staff'}</td>
                <td className="p-4">{req.budget ? formatCurrency(req.budget) : '—'}</td>
                <td className="p-4">{req.quantity || '—'}</td>
                <td className="p-4">{productCounts.get(req.id) || 0}</td>
                <td className="p-4">{req.deadline ? formatDate(req.deadline) : '—'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[req.status || ''] || 'bg-gray-100 text-gray-800'}`}>
                    {req.status || 'unknown'}
                  </span>
                </td>
                <td className="p-4">
                  {isWorkflowStage(req.workflow_stage) ? (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${TONE_CLASSES[STAGES[req.workflow_stage].tone]}`}>
                      {staffStageLabel(req.workflow_stage, origin)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Staff-created (not shared)</span>
                  )}
                </td>
                <td className="p-4 text-xs">
                  {waiting === 'client' ? <span className="font-semibold text-blue-700">Client</span> : waiting === 'staff' ? <span className="font-semibold text-amber-700">Our team</span> : <span className="text-gray-400">—</span>}
                </td>
              </tr>
              )
            })}
            {requirementRows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-8 text-center text-gray-500">No requirements found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}