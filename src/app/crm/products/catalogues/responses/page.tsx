import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { MIGRATION_MESSAGE, isMissingTable, responseSummary, type ResponseItem } from '@/lib/catalogues/responses'
import { ResponseActions } from './response-actions'

export const metadata = { title: 'Catalogue responses' }

type Row = {
  id: string
  status: 'submitted' | 'processed'
  comment: string | null
  items: ResponseItem[] | null
  revision: number
  submitted_at: string
  processed_at: string | null
  requirement_id: string | null
  campaign: { id: string; name: string } | { id: string; name: string }[] | null
  company: { id: string; name: string } | { id: string; name: string }[] | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

const TABS = [
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'processed', label: 'Processed' },
  { key: 'all', label: 'All' },
]

export default async function CatalogueResponsesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireStaff()
  const canAct = profile.role === 'admin' || profile.role === 'sales'
  const { status: statusParam } = await searchParams
  const tab = TABS.some((t) => t.key === statusParam) ? (statusParam as string) : 'awaiting'
  const supabase = await createClient()

  let query = supabase
    .from('catalogue_responses')
    .select('id, status, comment, items, revision, submitted_at, processed_at, requirement_id, campaign:campaigns!campaign_id(id, name), company:companies!company_id(id, name)')
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (tab === 'awaiting') query = query.eq('status', 'submitted')
  else if (tab === 'processed') query = query.eq('status', 'processed')
  const { data, error } = await query
  const rows = (data || []) as unknown as Row[]
  const needsMigration = isMissingTable(error)

  return (
    <div className="space-y-6">
      <BackButton href="/crm/products/catalogues" label="Back to Catalogues" />
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-primary)]">Catalogue responses</h1>
        <p className="mt-1 text-sm text-gray-500">
          What clients chose from the catalogues you sent them. Turn a response into a requirement, or mark it as followed up.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/crm/products/catalogues/responses?status=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-[#9C7A33] text-[#9C7A33]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {needsMigration ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {MIGRATION_MESSAGE} Run it in the Supabase SQL editor, then reload this page.
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Responses could not be loaded: {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500">
          {tab === 'awaiting' ? 'No client responses are waiting for you.' : 'No responses here yet.'}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const company = one(row.company)
            const campaign = one(row.campaign)
            const items = Array.isArray(row.items) ? row.items : []
            const processed = row.status === 'processed'
            return (
              <article key={row.id} className="rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {company ? (
                        <Link href={`/crm/companies/${company.id}`} className="hover:text-[#9C7A33]">{company.name}</Link>
                      ) : (
                        'Company'
                      )}
                      <span className="mx-1 font-normal text-gray-400">·</span>
                      {campaign ? (
                        <Link href={`/crm/products/catalogues/${campaign.id}`} className="hover:text-[#9C7A33]">{campaign.name}</Link>
                      ) : (
                        'Catalogue'
                      )}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Sent {formatDate(row.submitted_at)}
                      {row.revision > 1 ? ` · updated ${row.revision - 1} time${row.revision === 2 ? '' : 's'}` : ''}
                      {processed && row.processed_at ? ` · processed ${formatDate(row.processed_at)}` : ''}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${processed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
                    {responseSummary(row)}
                  </span>
                </div>

                {row.comment ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg bg-[#F5F7FA] p-3 text-sm text-gray-700">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Client comments / requested changes</span>
                    {row.comment}
                  </p>
                ) : null}

                {items.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead className="text-gray-500">
                        <tr>
                          <th className="py-1.5 pr-3">Selected product</th>
                          <th className="py-1.5 pr-3 text-right">Qty</th>
                          <th className="py-1.5 pr-3 text-right">Catalogue price</th>
                          <th className="py-1.5">Client note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((item) => (
                          <tr key={item.campaign_product_id}>
                            <td className="py-1.5 pr-3 font-medium text-gray-900">{item.name}</td>
                            <td className="py-1.5 pr-3 text-right">{item.quantity}</td>
                            <td className="py-1.5 pr-3 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="py-1.5 text-gray-600">{item.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">No products were selected; this response is comments only.</p>
                )}

                <div className="mt-4">
                  <ResponseActions responseId={row.id} hasProducts={items.length > 0} requirementId={row.requirement_id} processed={processed} canAct={canAct} />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
