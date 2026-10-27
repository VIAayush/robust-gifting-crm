'use client'

import { useRef, useState, useTransition } from 'react'
import { applySupplierAssignment, previewSupplierAssignment, type BulkPreview } from './actions'

const field = 'mt-1 w-full rounded-lg border px-3 py-2 text-sm'

const STATUS_STYLE: Record<string, string> = {
  create: 'bg-green-50 text-green-700',
  update: 'bg-blue-50 text-blue-700',
  unchanged: 'bg-gray-100 text-gray-600',
  error: 'bg-red-50 text-red-700',
}

export function BulkSupplierTool({ supplierNames, canCreateSuppliers }: { supplierNames: string[]; canCreateSuppliers: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<'csv' | 'skus'>('csv')
  const [skuList, setSkuList] = useState('')
  const [supplier, setSupplier] = useState('')
  const [cost, setCost] = useState('')
  const [preferred, setPreferred] = useState(false)
  const [assignMode, setAssignMode] = useState<'add' | 'replace'>('add')
  const [createMissing, setCreateMissing] = useState(false)
  const [skipErrors, setSkipErrors] = useState(false)
  const [preview, setPreview] = useState<BulkPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'error'>('all')
  const [pending, startTransition] = useTransition()

  function buildForm() {
    const fd = new FormData()
    fd.set('source', source)
    fd.set('assign_mode', assignMode)
    fd.set('create_missing', createMissing ? '1' : '0')
    fd.set('skip_errors', skipErrors ? '1' : '0')
    if (source === 'csv') {
      const file = fileRef.current?.files?.[0]
      if (file) fd.set('file', file)
    } else {
      fd.set('sku_list', skuList)
      fd.set('supplier', supplier)
      fd.set('supplier_cost', cost)
      fd.set('preferred', preferred ? '1' : '0')
    }
    return fd
  }

  function reset() {
    setPreview(null)
    setResult(null)
    setError(null)
  }

  function runPreview() {
    reset()
    startTransition(async () => {
      try {
        const res = await previewSupplierAssignment(buildForm())
        if ('error' in res) setError(res.error)
        else setPreview(res)
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  function runApply() {
    if (!preview || pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await applySupplierAssignment(buildForm())
        if ('error' in res) {
          setError(res.error)
          return
        }
        setResult(
          `Done. ${res.created} mapping${res.created === 1 ? '' : 's'} created, ${res.updated} updated, ${res.deactivated} switched off, ${res.suppliersCreated} supplier${res.suppliersCreated === 1 ? '' : 's'} created${res.failed ? `, ${res.failed} failed (check the preview and retry)` : ''}.`,
        )
        setPreview(null)
        if (fileRef.current) fileRef.current.value = ''
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  const counts = preview?.plan.counts
  const applicable = preview ? preview.plan.counts.create + preview.plan.counts.update + preview.plan.counts.deactivate : 0
  const blockedByErrors = Boolean(counts && counts.error > 0 && !skipErrors)
  const visibleRows = (preview?.rows || []).filter((row) => filter === 'all' || row.status === 'error')

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 text-xs">
      <div className="flex gap-2">
        {(['csv', 'skus'] as const).map((key) => (
          <button key={key} type="button" onClick={() => { setSource(key); reset() }} className={`rounded-lg border px-3 py-2 font-semibold ${source === key ? 'border-[#9C7A33] bg-[#9C7A33] text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
            {key === 'csv' ? 'Upload CSV' : 'Paste SKU list'}
          </button>
        ))}
      </div>

      {source === 'csv' ? (
        <label className="block font-medium text-gray-700">CSV file (columns: sku, supplier, supplier_cost, supplier_sku, lead_time_days, moq, preferred)
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={reset} className={field} />
        </label>
      ) : (
        <div className="space-y-3">
          <label className="block font-medium text-gray-700">SKUs (one per line, or comma separated)
            <textarea className={field} rows={5} value={skuList} onChange={(e) => { setSkuList(e.target.value); reset() }} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-medium text-gray-700">Supplier
              <input className={field} list="bulk-supplier-names" value={supplier} onChange={(e) => { setSupplier(e.target.value); reset() }} />
              <datalist id="bulk-supplier-names">{supplierNames.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
            <label className="block font-medium text-gray-700">Supplier cost per unit (optional, same for all)
              <input className={field} inputMode="decimal" value={cost} onChange={(e) => { setCost(e.target.value); reset() }} />
            </label>
          </div>
          <label className="flex items-center gap-2 font-medium text-gray-700"><input type="checkbox" checked={preferred} onChange={(e) => { setPreferred(e.target.checked); reset() }} /> Make this the preferred supplier</label>
        </div>
      )}

      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 font-semibold text-gray-700">How to apply</legend>
        <label className="flex items-start gap-2"><input type="radio" name="assign_mode" checked={assignMode === 'add'} onChange={() => { setAssignMode('add'); reset() }} /><span><strong>Add or update</strong>: keep the product&apos;s other suppliers.</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="assign_mode" checked={assignMode === 'replace'} onChange={() => { setAssignMode('replace'); reset() }} /><span><strong>Replace</strong>: switch off the product&apos;s other active suppliers (history and past orders are kept).</span></label>
        {canCreateSuppliers ? (
          <label className="flex items-center gap-2"><input type="checkbox" checked={createMissing} onChange={(e) => { setCreateMissing(e.target.checked); reset() }} /> Create suppliers that do not exist yet</label>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={runPreview} className="min-h-10 rounded-lg bg-[#9C7A33] px-4 font-semibold text-white disabled:opacity-60">{pending && !preview ? 'Checking…' : 'Preview (dry run)'}</button>
        {preview ? (
          <button type="button" disabled={pending || applicable === 0 || blockedByErrors} onClick={runApply} className="min-h-10 rounded-lg bg-green-700 px-4 font-semibold text-white disabled:opacity-50">
            {pending ? 'Applying…' : `Apply ${applicable} change${applicable === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {result ? <p role="status" className="text-green-700">{result}</p> : null}

      {preview && counts ? (
        <div className="space-y-3">
          <p className="text-gray-700">
            {counts.create} to create, {counts.update} to update, {counts.unchanged} unchanged, {counts.deactivate} to switch off
            {counts.suppliersToCreate ? `, ${counts.suppliersToCreate} new supplier${counts.suppliersToCreate === 1 ? '' : 's'} (${preview.plan.suppliersToCreate.join(', ')})` : ''}, <strong className={counts.error ? 'text-red-700' : ''}>{counts.error} with errors</strong>.
          </p>
          {counts.error > 0 ? (
            <label className="flex items-center gap-2"><input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} /> Skip rows with errors and apply the rest</label>
          ) : null}
          <div className="flex gap-2">
            {(['all', 'error'] as const).map((key) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1 ${filter === key ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{key === 'all' ? 'All rows' : 'Errors only'}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-[10px] uppercase text-gray-500"><tr><th className="py-2">Row</th><th>SKU</th><th>Supplier</th><th>Cost</th><th>Result</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={`${row.row}-${row.sku}-${row.supplier}`} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-500">{row.row}</td>
                    <td className="font-mono">{row.sku}</td>
                    <td>{row.supplier}</td>
                    <td>{row.status === 'error' ? '' : row.cost == null ? 'Not set' : row.costChanged && row.oldCost != null ? `${row.oldCost} → ${row.cost}` : row.cost}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                      {row.status === 'error' ? <span className="ml-2 text-red-700">{row.error}</span> : null}
                      {row.status !== 'error' && row.createSupplier ? <span className="ml-2 text-gray-500">new supplier</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.truncated ? <p className="text-gray-500">Showing the first 500 rows. The counts above cover the whole file.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
