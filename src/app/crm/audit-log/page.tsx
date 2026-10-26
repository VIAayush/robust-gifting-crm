import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import { requireStaff } from '@/lib/auth'
import { entityHref, describeAudit } from '@/lib/entity-href'
import { ShieldCheck } from 'lucide-react'
import { summarizeAuditChange } from '@/lib/audit-summary'

function raw(value: unknown) {
  if (value == null) return null
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    return null
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await requireStaff(['admin', 'management'])
  const { page = '1' } = await searchParams
  const current = Math.max(1, Number.parseInt(page, 10) || 1)
  const pageSize = 50
  const from = (current - 1) * pageSize

  const supabase = await createClient()
  const { data: logs, count } = await supabase
    .from('audit_logs')
    .select('*, profile:profiles(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  const total = count || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-normal text-[#0D1B2A]">Audit Log</h1>
        <p className="text-xs text-[#4A5568] mt-1">Company-wide create, update, assignment and status history.</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-x-auto shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-[#F5F7FA] border-b border-[#E2E8F0]">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold text-[#4A5568]">When</th>
              <th className="text-left px-5 py-3.5 font-semibold text-[#4A5568]">User</th>
              <th className="text-left px-5 py-3.5 font-semibold text-[#4A5568]">Action</th>
              <th className="text-left px-5 py-3.5 font-semibold text-[#4A5568]">Entity</th>
              <th className="text-left px-5 py-3.5 font-semibold text-[#4A5568]">What changed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7ECF3]">
            {logs?.length ? (
              logs.map((log) => {
                const href = entityHref(log.entity, log.entity_id)
                const label = `${describeAudit(log.action, log.entity || 'record')} ${log.entity_id ? `#${String(log.entity_id).slice(0, 8)}` : ''}`
                return (
                  <tr key={log.id} className="hover:bg-[#F5F7FA]">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-5 py-3 text-[#0D1B2A]">{(log.profile as any)?.full_name || (log.profile as any)?.email || 'System'}</td>
                    <td className="px-5 py-3 font-semibold text-[#0D1B2A] capitalize">{log.action?.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      {href ? (
                        <Link href={href} className="text-[#9C7A33] hover:underline font-medium">{label}</Link>
                      ) : (
                        <span className="capitalize">{label}</span>
                      )}
                    </td>
                    <td className="max-w-[28rem] px-5 py-3 text-[#334155]">
                      <p>{summarizeAuditChange(log.previous_value, log.new_value)}</p>
                      {raw(log.previous_value) || raw(log.new_value) ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600">Raw data</summary>
                          <div className="mt-1 grid gap-2 sm:grid-cols-2">
                            {raw(log.previous_value) ? (
                              <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 font-mono text-[10px] text-gray-600">{raw(log.previous_value)}</pre>
                            ) : null}
                            {raw(log.new_value) ? (
                              <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 font-mono text-[10px] text-gray-600">{raw(log.new_value)}</pre>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  <ShieldCheck className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between text-xs">
          {current > 1 ? <Link href={`/crm/audit-log?page=${current - 1}`} className="underline">Previous</Link> : <span />}
          <span>Page {current} of {totalPages}</span>
          {current < totalPages ? <Link href={`/crm/audit-log?page=${current + 1}`} className="underline">Next</Link> : <span />}
        </div>
      )}
    </div>
  )
}
