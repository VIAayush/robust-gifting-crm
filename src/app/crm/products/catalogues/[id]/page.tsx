import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { formatDate, formatDateTime, isUuid } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { ActionButton, CatalogueDetailsForm } from '@/components/catalogues/catalogue-controls'
import { CompanyAssigner } from '@/components/catalogues/company-assigner'
import { CatalogueItems, type CatalogueItem } from '@/components/catalogues/catalogue-items'
import { ProductAdder } from '@/components/catalogues/product-adder'
import { excludeIndividualCompanies } from '@/lib/companies/individual'
import { getCandidatePriceBounds, searchCatalogueCandidates, type CandidateFilter } from '@/lib/catalogues/candidates'
import { catalogueVisibilityIssues } from '@/lib/catalogues/visibility'
import { sortProductCategories } from '@/lib/products/categories'
import { deleteCatalogue, duplicateCatalogue, setCataloguePublished, updateCatalogueDetails } from '../actions'

const PAGE_SIZE = 50

type SearchParams = { tab?: string; q?: string; category?: string; min?: string; max?: string; supplier?: string; page?: string; duplicated?: string }

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

const EVENT_LABELS: Record<string, string> = {
  catalogue_created: 'Created',
  catalogue_assigned: 'Companies changed',
  catalogue_published: 'Published',
  catalogue_unpublished: 'Unpublished',
}

export default async function CatalogueDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const sp = await searchParams
  const profile = await requireStaff()
  const canEdit = profile.role === 'admin' || profile.role === 'sales'
  const supabase = await createClient()

  const { data: catalogue } = await supabase
    .from('campaigns')
    .select('id, name, occasion, description, budget_per_employee, published_to_client_at, created_at, owner:profiles!campaigns_owner_id_fkey(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (!catalogue) notFound()

  const filter: CandidateFilter = {
    mode: sp.tab === 'supplier' ? 'supplier' : 'search',
    q: sp.q || '',
    categoryId: sp.category || '',
    minPrice: sp.min || '',
    maxPrice: sp.max || '',
    supplierId: sp.supplier || '',
  }
  const page = Math.max(1, Number.parseInt(sp.page || '1', 10) || 1)

  const [assignedRes, companiesRes, offeringsRes, categoriesRes, suppliersRes, eventsRes, candidates, priceBounds] = await Promise.all([
    supabase.from('campaign_companies').select('company_id, company:companies(id, name)').eq('campaign_id', id),
    excludeIndividualCompanies(supabase.from('companies').select('id, name, company_type').eq('status', 'active')).order('name'),
    supabase
      .from('campaign_products')
      .select('id, product_id, selling_price, moq, display_order, product:products(id, name, sku, image_url, price, status, catalogue_access, category:categories(name))')
      .eq('campaign_id', id)
      .order('display_order'),
    supabase.from('categories').select('id, name'),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase.from('campaign_events').select('id, event_type, created_at, actor:profiles(full_name)').eq('campaign_id', id).order('created_at', { ascending: false }).limit(20),
    searchCatalogueCandidates(supabase, filter, page, PAGE_SIZE).catch((e: Error) => ({ rows: [], total: 0, error: e.message })),
    canEdit && (filter.mode === 'search' || filter.supplierId)
      ? getCandidatePriceBounds(supabase, filter).catch(() => null)
      : Promise.resolve(null),
  ])

  const needsMigration = Boolean(assignedRes.error)
  const assigned = (assignedRes.data || [])
    .map((row) => one(row.company as { id: string; name: string } | { id: string; name: string }[] | null))
    .filter(Boolean) as { id: string; name: string }[]

  const offerings = offeringsRes.data || []
  const productIds = offerings.map((o) => o.product_id as string)
  const { data: accessRows } = productIds.length && assigned.length
    ? await supabase.from('company_product_access').select('product_id, company_id').in('product_id', productIds).in('company_id', assigned.map((c) => c.id))
    : { data: [] as { product_id: string; company_id: string }[] }
  const accessByProduct = new Map<string, Set<string>>()
  for (const row of accessRows || []) {
    const set = accessByProduct.get(row.product_id as string) || new Set<string>()
    set.add(row.company_id as string)
    accessByProduct.set(row.product_id as string, set)
  }

  const items: CatalogueItem[] = offerings.flatMap((o) => {
    const product = one(o.product as Record<string, unknown> | Record<string, unknown>[] | null)
    if (!product) return []
    const category = one(product.category as { name: string } | { name: string }[] | null)
    return [
      {
        id: o.id as string,
        productId: product.id as string,
        name: product.name as string,
        sku: product.sku as string,
        image_url: (product.image_url as string | null) ?? null,
        selling_price: Number(o.selling_price) || 0,
        moq: Number(o.moq) || 1,
        listPrice: (product.price as number | null) ?? null,
        issues: catalogueVisibilityIssues(
          {
            id: product.id as string,
            name: product.name as string,
            status: product.status as string,
            catalogue_access: product.catalogue_access as string,
            price: product.price as number,
            image_url: product.image_url as string,
            category_name: category?.name ?? null,
          },
          assigned,
          accessByProduct.get(product.id as string) || new Set(),
        ),
      },
    ]
  })

  const published = Boolean(catalogue.published_to_client_at)
  const basePath = `/crm/products/catalogues/${id}`
  const owner = one(catalogue.owner as { full_name: string | null } | { full_name: string | null }[] | null)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackButton href="/crm/products/catalogues" label="Back to Catalogues" />

      {sp.duplicated ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Copy created as a draft with the same products. Assign companies and publish when ready.
        </p>
      ) : null}
      {needsMigration ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Assigning companies needs the migration <code>20261026_module_permissions_and_catalogues.sql</code>. Run it in the Supabase SQL editor,
          then reload.
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{catalogue.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {published ? 'Published' : 'Draft'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Created by {owner?.full_name || '—'} on {formatDate(catalogue.created_at)} · {items.length} product{items.length === 1 ? '' : 's'} ·{' '}
              {assigned.length} compan{assigned.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={setCataloguePublished} fields={{ id, publish: String(!published) }} tone={published ? 'default' : 'primary'}>
                {published ? 'Unpublish' : 'Publish to clients'}
              </ActionButton>
              <ActionButton action={duplicateCatalogue} fields={{ id }}>
                Duplicate
              </ActionButton>
              <ActionButton action={deleteCatalogue} fields={{ id }} tone="danger" confirm="Delete this catalogue? Products are not deleted.">
                Delete
              </ActionButton>
            </div>
          ) : null}
        </div>
        {canEdit ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[#9C7A33]">Edit details</summary>
            <div className="mt-3">
              <CatalogueDetailsForm
                action={updateCatalogueDetails}
                submitLabel="Save details"
                initial={{ id, name: catalogue.name, occasion: catalogue.occasion, description: catalogue.description, budget_per_employee: catalogue.budget_per_employee }}
              />
            </div>
          </details>
        ) : null}
        {catalogue.description ? <p className="text-sm text-gray-600">{catalogue.description}</p> : null}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-base font-bold text-gray-900">Assigned companies</h2>
        <p className="text-xs text-gray-500">Only these companies see the catalogue in their portal, and only once it is published.</p>
        {needsMigration ? null : (
          <CompanyAssigner
            campaignId={id}
            companies={(companiesRes.data || []).map((c) => ({ id: c.id as string, name: c.name as string }))}
            assignedIds={assigned.map((c) => c.id)}
            canEdit={canEdit}
          />
        )}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-base font-bold text-gray-900">Products in this catalogue ({items.length})</h2>
        <CatalogueItems campaignId={id} items={items} canEdit={canEdit} />
      </section>

      {canEdit ? (
        <section id="add-products" className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="text-base font-bold text-gray-900">Add products</h2>
          <ProductAdder
            campaignId={id}
            basePath={basePath}
            filter={filter}
            rows={candidates.rows}
            total={candidates.total}
            page={page}
            pageSize={PAGE_SIZE}
            priceBounds={priceBounds}
            inCatalogue={productIds}
            categories={sortProductCategories(categoriesRes.data || []).map((c) => ({ id: c.id as string, name: c.name as string }))}
            suppliers={(suppliersRes.data || []).map((s) => ({ id: s.id as string, name: s.name as string }))}
            canEdit={canEdit}
            loadError={'error' in candidates ? candidates.error : undefined}
          />
        </section>
      ) : null}

      {eventsRes.data?.length ? (
        <section className="space-y-2 rounded-2xl border bg-white p-5">
          <h2 className="text-base font-bold text-gray-900">History</h2>
          <ul className="space-y-1 text-xs text-gray-600">
            {eventsRes.data.map((event) => (
              <li key={event.id as string}>
                {formatDateTime(event.created_at as string)} · {EVENT_LABELS[event.event_type as string] || String(event.event_type).replace(/_/g, ' ')} ·{' '}
                {one(event.actor as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name || 'System'}
              </li>
            ))}
          </ul>
          <Link href="/crm/audit-log" className="text-xs font-semibold text-[#9C7A33] hover:underline">
            Full audit log
          </Link>
        </section>
      ) : null}
    </div>
  )
}
