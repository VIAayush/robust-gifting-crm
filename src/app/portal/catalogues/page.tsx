import Link from 'next/link'
import { FolderGit2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export default async function PortalCataloguesPage() {
  const supabase = await createClient()
  // RLS returns only catalogues published to this client's company.
  const { data: catalogues, error } = await supabase
    .from('campaigns')
    .select('id, name, occasion, description, budget_per_employee, published_to_client_at, products:campaign_products(count)')
    .order('published_to_client_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Catalogues</h1>
        <p className="mt-2 text-sm text-gray-600 sm:text-base">Gift selections your account manager has prepared for you.</p>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t load your catalogues right now. Please refresh the page.
        </div>
      ) : !catalogues?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <FolderGit2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No catalogues shared with you yet</p>
          <p className="mt-1 text-sm text-gray-500">Your account manager will share curated selections here. Meanwhile, browse all gifts.</p>
          <Link
            href="/portal/catalogue"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]"
          >
            Browse gifts
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {catalogues.map((catalogue) => {
            const count = (catalogue.products as { count: number }[] | null)?.[0]?.count ?? 0
            return (
              <Link
                key={catalogue.id}
                href={`/portal/catalogues/${catalogue.id}`}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:border-[#9C7A33] hover:shadow"
              >
                {catalogue.occasion ? <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{catalogue.occasion}</p> : null}
                <h2 className="mt-1 text-lg font-semibold text-gray-900">{catalogue.name}</h2>
                {catalogue.description ? <p className="mt-2 line-clamp-3 text-sm text-gray-600">{catalogue.description}</p> : null}
                <p className="mt-auto pt-4 text-xs text-gray-500">
                  {count} gift{count === 1 ? '' : 's'}
                  {Number(catalogue.budget_per_employee) > 0 ? ` · around ${formatCurrency(catalogue.budget_per_employee)} per person` : ''}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
