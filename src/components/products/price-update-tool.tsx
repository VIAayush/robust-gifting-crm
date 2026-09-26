'use client'

import { useRef, useState, useTransition } from 'react'
import { previewPriceUpdate, applyPriceUpdate, exportPriceSheet, type PricePreview } from '@/app/crm/products/pricing/actions'
import { formatCurrency } from '@/lib/utils'

export function PriceUpdateTool() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PricePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'change' | 'error'>('change')
  const [pending, startTransition] = useTransition()

  function currentFile() {
    return fileRef.current?.files?.[0] || null
  }

  function runPreview() {
    const file = currentFile()
    setError(null)
    setResult(null)
    setPreview(null)
    if (!file) return setError('Please choose a CSV file first.')
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const res = await previewPriceUpdate(fd)
      if ('error' in res) setError(res.error)
      else setPreview(res)
    })
  }

  function runApply() {
    const file = currentFile()
    if (!file || !preview) return
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const res = await applyPriceUpdate(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setResult(`Updated ${res.applied} product${res.applied === 1 ? '' : 's'}. ${res.skipped} unchanged, ${res.errors} row${res.errors === 1 ? '' : 's'} skipped due to errors.`)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  function runExport() {
    setError(null)
    startTransition(async () => {
      const res = await exportPriceSheet()
      if ('error' in res) return setError(res.error)
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `robust-gifting-prices-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const visible = (preview?.rows || []).filter((r) => (filter === 'all' ? true : r.status === filter))

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">1. Download the current price sheet</h2>
        <p className="text-xs text-gray-500">
          Edit the <span className="font-mono">price</span> and/or <span className="font-mono">mrp</span> columns. Leave a cell blank to keep its current value. Only existing SKUs are updated; nothing is created or deleted.
        </p>
        <button
          type="button"
          onClick={runExport}
          disabled={pending}
          className="rounded-lg border border-[#9C7A33] px-4 py-2 text-xs font-semibold text-[#9C7A33] hover:bg-[#9C7A33]/5 disabled:opacity-60"
        >
          Download price sheet (CSV)
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">2. Upload and preview changes</h2>
        <label htmlFor="price-csv" className="block text-xs font-semibold text-gray-700">CSV file</label>
        <input id="price-csv" ref={fileRef} type="file" accept=".csv,text/csv" className="block text-xs" onChange={() => setPreview(null)} />
        <button
          type="button"
          onClick={runPreview}
          disabled={pending}
          className="rounded-lg bg-[#9C7A33] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
        >
          {pending && !preview ? 'Checking…' : 'Preview changes'}
        </button>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}
        {result ? <p role="status" className="rounded-lg bg-green-50 p-2 text-xs text-green-800">{result}</p> : null}
      </div>

      {preview ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900">3. Review and apply</h2>
            <div className="flex gap-2 text-[11px]">
              {(['change', 'error', 'all'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded-full px-3 py-1 font-semibold ${filter === f ? 'bg-[#9C7A33] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {f === 'change' ? `${preview.changes} changes` : f === 'error' ? `${preview.errors} errors` : `All ${preview.rows.length}`}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Product</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">MRP</th>
                  <th className="p-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={`${r.row}-${r.sku}`} className="border-t border-gray-100">
                    <td className="p-2 text-gray-400">{r.row}</td>
                    <td className="p-2 font-mono">{r.sku || '—'}</td>
                    <td className="p-2 text-gray-700">{r.name || '—'}</td>
                    <td className="p-2">
                      {r.oldPrice !== r.newPrice && r.newPrice != null ? (
                        <><span className="text-gray-400 line-through">{formatCurrency(r.oldPrice)}</span> → <span className="font-semibold">{formatCurrency(r.newPrice)}</span></>
                      ) : formatCurrency(r.oldPrice)}
                    </td>
                    <td className="p-2">
                      {(r.oldMrp ?? null) !== (r.newMrp ?? null) && r.status !== 'error' ? (
                        <><span className="text-gray-400 line-through">{formatCurrency(r.oldMrp)}</span> → <span className="font-semibold">{formatCurrency(r.newMrp)}</span></>
                      ) : formatCurrency(r.oldMrp)}
                    </td>
                    <td className="p-2">
                      {r.status === 'error' ? (
                        <span className="text-red-700">{r.error}</span>
                      ) : r.status === 'change' ? (
                        <span className="text-emerald-700">Will update</span>
                      ) : (
                        <span className="text-gray-400">No change</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-400">Nothing to show for this filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={runApply}
            disabled={pending || preview.changes === 0}
            className="rounded-lg bg-[#9C7A33] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
          >
            {pending ? 'Applying…' : `Apply ${preview.changes} change${preview.changes === 1 ? '' : 's'}`}
          </button>
          {preview.errors > 0 ? <p className="text-[11px] text-gray-500">Rows with errors are skipped; everything else still applies.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
