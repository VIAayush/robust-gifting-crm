import Link from 'next/link'
import { FolderGit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import { ActionButton, CatalogueDetailsForm } from '@/components/catalogues/catalogue-controls'
import { createCatalogue, deleteCatalogue, duplicateCatalogue, setCataloguePublished } from './actions'

type Row = {
  id: string
  name: string
  occasion: string | null
  published_to_client_at: string | null
  created_at: string
  owner: { full_name: string | null } | { full_name: string | null }[] | null
  companies: { company: { name: string } | { name: string }[] | null }[] | null
  products: { count: number }[] | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export const metadata = { title: 'Catalogues' }

export default async function CataloguesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const profile = await requireStaff()
  const { deleted } = await searchParams
  const canEdit = profile.role === 'admin' || profile.role === 'sales'
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaigns')
    .select(
      'id, name, occasion, published_to_client_at, created_at, owner:profiles!campaigns_owner_id_fkey(full_name), companies:campaign_companies(company:companies(name)), products:campaign_products(count)',
    )
    .order('created_at', { ascending: false })
  const rows = (data || []) as unknown as Row[]
  const needsMigration = Boolean(error && /campaign_companies|relationship|does not exist|schema cache/i.test(error.message))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-primary)]">Catalogues</h1>
          <p className="mt-1 text-sm text-gray-500">
            Curated product lists you can assign to one or more companies. Published catalogues appear in those clients&apos; portals.
          </p>
        </div>
      </div>

      {deleted ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Catalogue deleted. The products themselves were not changed.
        </p>
      ) : null}

      {needsMigration ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Catalogues need the database migration <code>20261026_module_permissions_and_catalogues.sql</code>. Run it in the Supabase SQL editor,
          then reload this page.
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Catalogues could not be loaded. Please refresh the page.
        </div>
      ) : null}

      {canEdit && !needsMigration ? (
        <details className="rounded-2xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">+ New catalogue</summary>
          <div className="mt-4">
            <CatalogueDetailsForm action={createCatalogue} submitLabel="Create catalogue" />
          </div>
        </details>
      ) : null}

      {!error ? (
        rows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <FolderGit2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">No catalogues yet</p>
            <p className="mt-1 text-sm text-gray-500">Create one, add products, assign companies, then publish it.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="p-3">Catalogue</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Assigned to</th>
                  <th className="p-3 text-right">Products</th>
                  <th className="p-3">Created by</th>
                  <th className="p-3">Created</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const companies = (row.companies || []).map((c) => one(c.company)?.name).filter(Boolean) as string[]
                  const count = row.products?.[0]?.count ?? 0
                  const published = Boolean(row.published_to_client_at)
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="p-3">
                        <Link href={`/crm/products/catalogues/${row.id}`} className="font-semibold text-gray-900 hover:text-[#9C7A33]">
                          {row.name}
                        </Link>
                        {row.occasion ? <p className="text-xs text-gray-500">{row.occasion}</p> : null}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-700">
                        {companies.length === 0 ? (
                          <span className="text-gray-400">No companies</span>
                        ) : (
                          <span title={companies.join(', ')}>
                            {companies.slice(0, 3).join(', ')}
                            {companies.length > 3 ? ` +${companies.length - 3} more` : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">{count}</td>
                      <td className="p-3 text-xs">{one(row.owner)?.full_name || '—'}</td>
                      <td className="p-3 text-xs">{formatDate(row.created_at)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Link
                            href={`/crm/products/catalogues/${row.id}`}
                            className="inline-flex min-h-8 items-center rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            {canEdit ? 'Edit' : 'View'}
                          </Link>
                          {canEdit ? (
                            <>
                              <ActionButton action={setCataloguePublished} fields={{ id: row.id, publish: String(!published) }} tone={published ? 'default' : 'primary'}>
                                {published ? 'Unpublish' : 'Publish'}
                              </ActionButton>
                              <ActionButton action={duplicateCatalogue} fields={{ id: row.id }}>
                                Duplicate
                              </ActionButton>
                              <ActionButton action={deleteCatalogue} fields={{ id: row.id }} tone="danger" confirm="Delete this catalogue? Products are not deleted.">
                                Delete
                              </ActionButton>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  )
}
