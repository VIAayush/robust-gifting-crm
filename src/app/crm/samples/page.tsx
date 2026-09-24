import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { receiveSample, moveSample, sendSampleToClient, updateSampleRequestStatus, fulfillSampleRequest } from './actions'
import { requireStaff, canSeeCosts } from '@/lib/auth'
import { asFormAction } from '@/lib/form-action'
import { MobileSheetSelect } from '@/components/ui/mobile-filter-sheet'

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; received?: string; moved?: string; updated?: string; fulfilled?: string }>
}) {
  const profile = await requireStaff()
  const supabase = await createClient()
  const showCost = canSeeCosts(profile.role)
  const params = await searchParams
  const error = params.error || ''
  const received = params.received === '1'
  const moved = params.moved === '1'
  const requestUpdated = params.updated === '1'
  const requestFulfilled = params.fulfilled === '1'

  const [{ data: samples }, { data: movements }, { data: products }, { data: companies }, { data: sampleRequests }] = await Promise.all([
    supabase.from('sample_stock').select('*, product:products(name, sku)'),
    supabase.from('sample_movements').select('*, product:products(name), company:companies(name)').order('created_at', { ascending: false }).limit(25),
    supabase.from('products').select('id, name, sku').eq('status', 'active').order('name').limit(200),
    supabase.from('companies').select('id, name').order('name'),
    supabase
      .from('sample_requests')
      .select(
        '*, product:products(name, sku), variant:product_variants(colour, display_name), company:companies(name), requested_by_profile:profiles!sample_requests_requested_by_fkey(full_name)'
      )
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false }),
  ])

  const totalInOffice = samples?.reduce((acc, curr) => acc + (curr.in_office || 0), 0) || 0
  const totalWithTeam = samples?.reduce((acc, curr) => acc + (curr.with_team || 0), 0) || 0
  const totalWithClient = samples?.reduce((acc, curr) => acc + (curr.with_client || 0), 0) || 0
  const totalPending = samples?.reduce((acc, curr) => acc + (curr.pending_supplier || 0), 0) || 0

  // Only products with office stock can actually be sent, so the "Send to client" bar offers just those.
  const inOfficeSamples = (samples || [])
    .filter((s) => (s.in_office || 0) > 0)
    .map((s) => {
      const product = Array.isArray(s.product) ? s.product[0] : s.product
      return { product_id: s.product_id, in_office: s.in_office, productName: product?.name || 'Product', productSku: product?.sku || '' }
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Sample Management</h1>
        <p className="text-xs text-[#4A5568] mt-1">
          Track physical samples in office, with the team, with a client, or pending from a supplier. Receive a product
          into office stock, then use{' '}
          <span className="font-semibold text-[#9C7A33]">Send to client</span> below to dispatch it directly to a
          company.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}
      {received ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Sample received into office stock.
        </div>
      ) : null}
      {moved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Sample movement recorded.
        </div>
      ) : null}
      {requestUpdated ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Sample request updated.
        </div>
      ) : null}
      {requestFulfilled ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Sample request fulfilled and shipped to the client.
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['In Office', totalInOffice],
          ['With Team', totalWithTeam],
          ['With Client', totalWithClient],
          ['Pending Supplier', totalPending],
        ].map(([label, value]) => (
          <div key={String(label)} className="p-4 bg-white border rounded-xl">
            <p className="text-xs text-[#4A5568]">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-serif text-lg mb-1">Customer sample requests</h2>
        <p className="mb-3 text-xs text-[#4A5568]">
          Requests submitted by clients from their Interest List in the portal. Fulfilling one ships it from office
          stock the same way <span className="font-semibold text-[#9C7A33]">Send to client</span> does, and records it below.
        </p>
        {(sampleRequests || []).length === 0 ? (
          <p className="text-sm text-gray-500">No open sample requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#F5F7FA] text-xs text-[#4A5568]">
                <tr>
                  <th className="p-2.5">Company</th>
                  <th className="p-2.5">Product</th>
                  <th className="p-2.5">Qty</th>
                  <th className="p-2.5">Requested by</th>
                  <th className="p-2.5">Notes</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {(sampleRequests || []).map((request) => {
                  const product = Array.isArray(request.product) ? request.product[0] : request.product
                  const variant = Array.isArray(request.variant) ? request.variant[0] : request.variant
                  const company = Array.isArray(request.company) ? request.company[0] : request.company
                  const requestedByProfile = Array.isArray(request.requested_by_profile)
                    ? request.requested_by_profile[0]
                    : request.requested_by_profile
                  return (
                    <tr key={request.id} className="border-t align-top">
                      <td className="p-2.5 font-medium">{company?.name || '—'}</td>
                      <td className="p-2.5">
                        <Link href={`/crm/products/${request.product_id}`} className="hover:underline">
                          {product?.name}
                        </Link>
                        <p className="text-[11px] text-[#4A5568]">
                          {product?.sku}
                          {variant?.colour ? ` · ${variant.display_name || variant.colour}` : ''}
                        </p>
                      </td>
                      <td className="p-2.5">{request.quantity}</td>
                      <td className="p-2.5 text-[11px] text-[#4A5568]">{requestedByProfile?.full_name || '—'}</td>
                      <td className="p-2.5 max-w-[200px] truncate text-[11px] text-[#4A5568]" title={request.notes || ''}>
                        {request.notes || '—'}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            request.status === 'approved'
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {request.status === 'approved' ? 'Approved' : 'Pending review'}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <form action={asFormAction(fulfillSampleRequest)}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <button className="rounded-lg bg-[#9C7A33] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#7C6224]">
                              Fulfil &amp; ship
                            </button>
                          </form>
                          {request.status === 'pending' && (
                            <form action={asFormAction(updateSampleRequestStatus)}>
                              <input type="hidden" name="request_id" value={request.id} />
                              <input type="hidden" name="status" value="approved" />
                              <button className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-[#4A5568] hover:bg-[#F5F7FA]">
                                Approve
                              </button>
                            </form>
                          )}
                          <form action={asFormAction(updateSampleRequestStatus)}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <input type="hidden" name="status" value="rejected" />
                            <button className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                              Reject
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form action={asFormAction(receiveSample)} className="grid items-end gap-3 rounded-2xl border bg-white p-4 text-xs md:grid-cols-4">
        <MobileSheetSelect
          name="product_id"
          label="Product"
          required
          showDesktopLabel
          emptyLabel="Select product to receive"
          className="md:col-span-2"
          options={[
            { value: '', label: 'Select product to receive' },
            ...(products || []).map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` })),
          ]}
        />
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A5568]">Quantity</span>
          <input name="quantity" type="number" min="1" defaultValue={1} required className="min-h-11 w-full rounded-lg border px-2 py-2" />
        </label>
        {showCost ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A5568]">Unit cost</span>
            <input name="unit_cost" type="number" step="0.01" min="0" placeholder="0.00" className="min-h-11 w-full rounded-lg border px-2 py-2" />
          </label>
        ) : (
          <input type="hidden" name="unit_cost" value="0" />
        )}
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9C7A33] px-4 py-2.5 font-semibold text-white md:col-span-4"
        >
          Receive into office
        </button>
      </form>

      <form action={asFormAction(sendSampleToClient)} className="grid items-end gap-3 rounded-2xl border bg-white p-4 text-xs md:grid-cols-4">
        <MobileSheetSelect
          name="product_id"
          label="Product"
          required
          showDesktopLabel
          emptyLabel={inOfficeSamples.length === 0 ? 'No products in office stock yet' : 'Select product to send'}
          className="md:col-span-2"
          options={[
            { value: '', label: inOfficeSamples.length === 0 ? 'No products in office stock yet' : 'Select product to send' },
            ...inOfficeSamples.map((s) => ({
              value: s.product_id as string,
              label: `${s.productName} · ${s.productSku} (${s.in_office} in office)`,
            })),
          ]}
        />
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A5568]">Quantity</span>
          <input name="quantity" type="number" min="1" defaultValue={1} required className="min-h-11 w-full rounded-lg border px-2 py-2" />
        </label>
        <MobileSheetSelect
          name="company_id"
          label="Client"
          required
          showDesktopLabel
          emptyLabel="Select client"
          options={[
            { value: '', label: 'Select client' },
            ...(companies || []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9C7A33] px-4 py-2.5 font-semibold text-white md:col-span-4"
        >
          Send to client
        </button>
      </form>

      <div className="bg-white rounded-2xl border overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-[#F5F7FA] text-xs text-[#4A5568]">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Office</th>
              <th className="p-3">Team</th>
              <th className="p-3">Client</th>
              <th className="p-3">Supplier</th>
              {showCost && <th className="p-3">Unit cost</th>}
              <th className="p-3">Move</th>
            </tr>
          </thead>
          <tbody>
            {(samples || []).map((sample) => {
              const product = Array.isArray(sample.product) ? sample.product[0] : sample.product
              return (
                <tr key={sample.id} className="border-t align-top">
                  <td className="p-3">
                    <Link href={`/crm/products/${sample.product_id}`} className="font-medium hover:underline">{product?.name}</Link>
                    <p className="text-[11px] text-[#4A5568]">{product?.sku}</p>
                  </td>
                  <td className="p-3">{sample.in_office || 0}</td>
                  <td className="p-3">{sample.with_team || 0}</td>
                  <td className="p-3">{sample.with_client || 0}</td>
                  <td className="p-3">{sample.pending_supplier || 0}</td>
                  {showCost && <td className="p-3">{formatCurrency(sample.unit_cost)}</td>}
                  <td className="p-3">
                    <div className="min-w-[220px]">
                      <details className="text-[11px]">
                        <summary className="cursor-pointer text-[#4A5568]">Other movement</summary>
                        <p className="mt-1 text-[10px] text-gray-400">
                          For sending office stock to a client, use the Send to client bar above.
                        </p>
                        <form action={asFormAction(moveSample)} className="mt-1.5 grid grid-cols-2 gap-1">
                          <input type="hidden" name="stock_id" value={sample.id} />
                          <MobileSheetSelect
                            name="from_holder"
                            label="From"
                            defaultValue="office"
                            options={[
                              { value: 'office', label: 'From office' },
                              { value: 'team', label: 'From team' },
                              { value: 'client', label: 'From client' },
                              { value: 'supplier', label: 'From supplier' },
                            ]}
                          />
                          <MobileSheetSelect
                            name="to_holder"
                            label="To"
                            defaultValue="team"
                            options={[
                              { value: 'team', label: 'To team' },
                              { value: 'office', label: 'To office' },
                              { value: 'client', label: 'To client' },
                              { value: 'supplier', label: 'To supplier' },
                            ]}
                          />
                          <input name="quantity" type="number" min="1" defaultValue={1} className="border rounded px-1 py-1" />
                          <MobileSheetSelect
                            name="company_id"
                            label="Client"
                            emptyLabel="Client (if needed)"
                            options={[
                              { value: '', label: 'Client (if needed)' },
                              ...(companies || []).map((c) => ({ value: c.id, label: c.name })),
                            ]}
                          />
                          <input name="note" placeholder="Note / holder name" className="col-span-2 border rounded px-1 py-1" />
                          <button className="col-span-2 border rounded py-1 font-semibold">Record movement</button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              )
            })}
            {(!samples || samples.length === 0) && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-500">No sample stock yet — receive a product above to add it here.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <h2 className="font-serif text-lg mb-3">Movement history</h2>
        {(movements || []).map((m) => {
          const product = Array.isArray(m.product) ? m.product[0] : m.product
          const company = Array.isArray(m.company) ? m.company[0] : m.company
          return (
            <p key={m.id} className="text-xs py-1 border-t">
              {formatDateTime(m.created_at)} · {product?.name} · {m.quantity} · {m.from_holder} → {m.to_holder}
              {company?.name ? ` · ${company.name}` : ''} {m.note ? ` · ${m.note}` : ''}
            </p>
          )
        })}
        {(!movements || movements.length === 0) && <p className="text-sm text-gray-500">No movements recorded.</p>}
      </div>
    </div>
  )
}
