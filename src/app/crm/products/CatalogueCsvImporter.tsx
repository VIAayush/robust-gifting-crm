'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { autoMapHeaders, parseCsv } from '@/lib/csv'
import { importCatalogueCsvChunk, validateCatalogueCsv, type ImportFailure, type ImportSummary } from './import-actions'
import { MobileSheetSelect } from '@/components/ui/mobile-filter-sheet'

const FIELD_LABELS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Product name', required: true },
  { key: 'sku', label: 'SKU', required: true },
  { key: 'price', label: 'Price', required: true },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'moq', label: 'MOQ' },
  { key: 'supplier_cost', label: 'Supplier cost' },
  { key: 'hsn_code', label: 'HSN' },
  { key: 'image_url', label: 'Image URL' },
  { key: 'image_filename', label: 'Image filename' },
  { key: 'catalogue_access', label: 'Visibility (all / selected / none)' },
  { key: 'companies', label: 'Companies (semicolon-separated names)' },
  { key: 'colour', label: 'Colour' },
  { key: 'size', label: 'Size' },
  { key: 'gender', label: 'Gender' },
  { key: 'material', label: 'Material' },
  { key: 'variant_sku', label: 'Variant SKU (optional, rarely needed)' },
  { key: 'extra_price', label: 'Variant price difference' },
  { key: 'status', label: 'Status' },
]

const CHUNK_SIZE = 25

export function CatalogueCsvImporter() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [images, setImages] = useState<File[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [validated, setValidated] = useState(false)
  const [overwrite, setOverwrite] = useState(true)
  const [skippedSkus, setSkippedSkus] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pending, startTransition] = useTransition()

  const mappedRequired = useMemo(
    () => FIELD_LABELS.filter((f) => f.required).every((f) => mapping[f.key]),
    [mapping],
  )

  const buildFormData = () => {
    const data = new FormData()
    data.set('csv', csvFile as File)
    data.set('mapping', JSON.stringify(mapping))
    data.set('overwrite', overwrite ? '1' : '0')
    images.forEach((image) => data.append('images', image))
    return data
  }

  const resetValidation = () => {
    setValidated(false)
    setSummary(null)
    setSkippedSkus(new Set())
    setProgress(null)
  }

  const onCsv = async (file: File | null) => {
    resetValidation()
    setCsvFile(file)
    if (!file) {
      setHeaders([])
      setPreview([])
      setMapping({})
      return
    }
    const table = parseCsv(await file.text())
    setHeaders(table.headers)
    setPreview(table.rows.slice(0, 5))
    setMapping(autoMapHeaders(table.headers))
  }

  const onValidate = () => {
    if (!csvFile) {
      toast.error('Choose a CSV file to import')
      return
    }
    if (!mappedRequired) {
      toast.error('Map product name, SKU and price before validating')
      return
    }
    startTransition(async () => {
      const result = await validateCatalogueCsv(buildFormData())
      if ('error' in result) {
        toast.error(result.error)
        setValidated(false)
        return
      }
      setSummary(result)
      setValidated(true)
      setSkippedSkus(new Set())
      if (result.failed === 0) toast.success('No issues found — ready to import')
      else toast.error(`${result.failed} row${result.failed === 1 ? '' : 's'} need fixing before you can import`)
    })
  }

  const toggleSkip = (sku: string) => {
    setSkippedSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  const onImport = () => {
    if (!csvFile || !validated || !summary) return
    const toCommit = summary.groups.filter((g) => !skippedSkus.has(g.groupSku))
    if (toCommit.length === 0) {
      toast.error('Every product is skipped — nothing to import')
      return
    }

    startTransition(async () => {
      let created = 0
      let updated = 0
      const failures: ImportFailure[] = []
      let chunkIndex = 0
      let totalToCommit = toCommit.length
      let lastResult: ImportSummary | null = null

      while (true) {
        const data = buildFormData()
        data.set('skip_skus', JSON.stringify(Array.from(skippedSkus)))
        data.set('chunk_index', String(chunkIndex))
        data.set('chunk_size', String(CHUNK_SIZE))

        const result = await importCatalogueCsvChunk(data)
        if ('error' in result) {
          toast.error(result.error)
          setProgress(null)
          return
        }
        lastResult = result

        if (chunkIndex === 0 && !result.committed && result.failed > 0) {
          // The file changed since it was validated (a race, not a normal case).
          setSummary(result)
          toast.error('Import blocked — the CSV changed since it was validated. Validate again.')
          setValidated(false)
          setProgress(null)
          return
        }

        created += result.created
        updated += result.updated
        failures.push(...result.failures)
        totalToCommit = result.totalToCommit
        setProgress({ done: created + updated, total: totalToCommit })

        if (!result.hasMore) break
        chunkIndex += 1
      }

      setProgress(null)
      setSummary(
        lastResult && {
          ...lastResult,
          created,
          updated,
          imported: created + updated,
          failed: failures.length,
          failures,
        },
      )

      if (created + updated > 0) {
        const parts = [created > 0 ? `${created} created` : '', updated > 0 ? `${updated} overwritten` : ''].filter(Boolean)
        toast.success(`Import complete — ${parts.join(', ')}`)
      }
      if (failures.length > 0) toast.error(`${failures.length} row${failures.length === 1 ? '' : 's'} failed`)
    })
  }

  const readyToImport = validated && summary && summary.failed === 0 && !summary.committed
  const needsManualMapping = headers.length > 0 && !mappedRequired

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-3">
      {!readyToImport ? (
        <button
          type="button"
          disabled={pending || !mappedRequired}
          onClick={onValidate}
          className="px-6 py-2 text-xs font-semibold text-white bg-[#9C7A33] hover:bg-[#7C6224] rounded-lg disabled:opacity-50"
        >
          {pending ? 'Validating…' : 'Validate'}
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={onImport}
            className="px-6 py-2 text-xs font-semibold text-white bg-green-700 hover:bg-green-800 rounded-lg disabled:opacity-50"
          >
            {pending
              ? progress
                ? `Importing… ${progress.done} / ${progress.total}`
                : 'Importing…'
              : `Import ${summary!.groups.length - skippedSkus.size} product${summary!.groups.length - skippedSkus.size === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onValidate}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            Re-validate
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onCsv(e.target.files?.[0] || null)}
            className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-md file:border file:border-gray-200 file:bg-white file:text-xs"
          />
          <p className="text-[11px] text-gray-500 mt-2">
            Every row needs a product name, SKU, price, category and at least one photo
            (<span className="font-mono">image_url</span> or <span className="font-mono">image_filename</span>) —
            rows missing any of these fail validation before anything is imported. Optional: description,
            supplier, MOQ, visibility, companies, colour, size. Give the same product a row per colour with
            the same SKU (or a colour-suffixed SKU, e.g. <span className="font-mono">RG-NO-02-BLUE</span>)
            and they will import as one product with colour variants, not separate products. Catalogues of
            any size are supported — large files import in small batches automatically.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => {
              setOverwrite(e.target.checked)
              resetValidation()
            }}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9C7A33] focus:ring-[#9C7A33]"
          />
          <span className="text-[11px] text-gray-600">
            <span className="font-semibold text-gray-800">Update products that already have this SKU</span>
            <br />
            On an exact SKU match the existing product is overwritten — details, colours and photos are
            replaced from this file, while its id and any order, quotation or campaign history stay intact.
            Untick this to leave existing SKUs untouched and skip them — any genuinely new SKUs in the file
            still import normally.
          </span>
        </label>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Product photos (optional)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => {
              setImages(Array.from(e.target.files || []))
              resetValidation()
            }}
            className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-md file:border file:border-gray-200 file:bg-white file:text-xs"
          />
          <p className="text-[11px] text-gray-500 mt-2">
            Match files to the CSV <span className="font-mono">image_filename</span> column (exact name, any
            case, with or without a folder prefix). Separate multiple photos for one row with a comma,
            semicolon or pipe — this works for <span className="font-mono">image_url</span> too, which
            stores each URL as-is.
          </p>
          {images.length > 0 && (
            <p className="text-[11px] text-gray-600 mt-1">{images.length} image{images.length === 1 ? '' : 's'} ready to match</p>
          )}
        </div>
      </div>

      {needsManualMapping && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Column mapping</h2>
            <p className="text-[11px] text-gray-500 mt-1">
              Couldn&apos;t automatically match product name, SKU and price to columns in this file — map them
              below.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELD_LABELS.map((field) => (
              <MobileSheetSelect
                key={field.key}
                label={`${field.label}${field.required ? ' *' : ''}`}
                showDesktopLabel
                value={mapping[field.key] || ''}
                onChange={(next) => {
                  setMapping((prev) => ({ ...prev, [field.key]: next }))
                  resetValidation()
                }}
                emptyLabel="Ignore"
                options={[
                  { value: '', label: 'Ignore' },
                  ...headers.map((header) => ({ value: header, label: header })),
                ]}
              />
            ))}
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="text-left px-2 py-2 font-semibold text-gray-500 whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {headers.map((_, col) => (
                        <td key={col} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{row[col] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {actionButtons}

          {pending && progress && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-green-700 transition-all"
                style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {headers.length > 0 && !needsManualMapping && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
          {actionButtons}

          {pending && progress && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-green-700 transition-all"
                style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {readyToImport && summary && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">
              Products in this file ({summary.groups.length - skippedSkus.size} of {summary.groups.length} selected)
            </h2>
            <div className="flex gap-3 text-[11px] font-semibold text-[#9C7A33]">
              <button type="button" onClick={() => setSkippedSkus(new Set())} className="hover:underline">
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSkippedSkus(new Set(summary.groups.map((g) => g.groupSku)))}
                className="hover:underline"
              >
                Deselect all
              </button>
              {summary.groups.some((g) => g.isOverwrite) && (
                <button
                  type="button"
                  onClick={() =>
                    setSkippedSkus((prev) => {
                      const next = new Set(prev)
                      summary.groups.filter((g) => g.isOverwrite).forEach((g) => next.add(g.groupSku))
                      return next
                    })
                  }
                  className="hover:underline"
                >
                  Skip all overwrites
                </button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-semibold text-gray-500">SKU</th>
                  <th className="text-left px-2 py-2 font-semibold text-gray-500">Name</th>
                  <th className="text-left px-2 py-2 font-semibold text-gray-500">Colours</th>
                  <th className="text-left px-2 py-2 font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.groups.map((group) => {
                  const skipped = skippedSkus.has(group.groupSku)
                  return (
                    <tr key={group.groupSku} className={`border-t border-gray-100 ${skipped ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          disabled={pending}
                          checked={!skipped}
                          onChange={() => toggleSkip(group.groupSku)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[#9C7A33] focus:ring-[#9C7A33]"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-700 whitespace-nowrap">{group.groupSku}</td>
                      <td className="px-2 py-1.5 text-gray-700">{group.name}</td>
                      <td className="px-2 py-1.5 text-gray-500">{group.colours.join(', ') || '—'}</td>
                      <td className="px-2 py-1.5">
                        {group.isOverwrite ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Overwrite
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                            New
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-3">
          <h2 className="text-sm font-bold text-gray-900">
            {summary.committed ? 'Import summary' : summary.failed === 0 ? 'Validation passed' : 'Validation found issues'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <SummaryStat label="Total rows" value={summary.total} />
            <SummaryStat label={summary.committed ? 'New products' : 'To create'} value={summary.created} />
            <SummaryStat label={summary.committed ? 'Overwritten' : 'To overwrite'} value={summary.updated} />
            <SummaryStat label="Skipped" value={summary.skipped + (summary.committed ? skippedSkus.size : 0)} />
            <SummaryStat label="Failed" value={summary.failed} />
          </div>
          {summary.failures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">
                {summary.committed ? 'These rows failed during import:' : 'Fix these rows before importing:'}
              </p>
              <ul className="text-xs text-red-700 space-y-1">
                {summary.failures.slice(0, 50).map((failure) => (
                  <li key={`${failure.row}-${failure.sku}`}>
                    Row {failure.row} ({failure.sku}): {failure.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">Warnings (won&apos;t block import):</p>
              <ul className="text-xs text-amber-700 space-y-1">
                {summary.warnings.map((warning, i) => (
                  <li key={i}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[10px] uppercase font-semibold text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}
