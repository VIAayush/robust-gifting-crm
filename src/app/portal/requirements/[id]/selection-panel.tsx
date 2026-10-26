'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { saveSelection, submitSelection } from '../actions'
import { formatCurrency } from '@/lib/utils'
import { budgetStatus, clientCanSelectProducts, selectionTotals, type WorkflowStage } from '@/lib/requirements/workflow'

export type SelectionLineProp = {
  product_id: string
  name: string
  sku: string | null
  image_url: string | null
  unit_price: number
  moq: number
  quantity: number
  notes: string
}

export type CatalogueResult = Omit<SelectionLineProp, 'quantity' | 'notes'>

type Props = {
  requirementId: string
  stage: WorkflowStage
  budgetTotal: number | null
  initialLines: SelectionLineProp[]
  results: CatalogueResult[]
  searchTerm: string
}

const INDICATOR = {
  none: { label: 'No approved budget on this requirement', className: 'bg-gray-100 text-gray-700' },
  within: { label: 'Within budget', className: 'bg-green-50 text-green-700' },
  near: { label: 'Close to your budget', className: 'bg-amber-50 text-amber-800' },
  over: { label: 'Above your approved budget', className: 'bg-red-50 text-red-700' },
} as const

export function SelectionPanel({ requirementId, stage, budgetTotal, initialLines, results, searchTerm }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const editable = clientCanSelectProducts(stage)
  const [lines, setLines] = useState<SelectionLineProp[]>(initialLines)
  const [quantityText, setQuantityText] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLines.map((l) => [l.product_id, String(l.quantity)])),
  )
  const [search, setSearch] = useState(searchTerm)
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = lines.map((l) => {
    const n = Number(quantityText[l.product_id])
    return { ...l, quantity: Number.isInteger(n) && n > 0 ? n : 0 }
  })
  const totals = useMemo(
    () => selectionTotals(parsed.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, quantityText],
  )
  const status = budgetStatus(totals.total, budgetTotal)
  const invalid = parsed.some((l) => l.quantity < 1 || (l.moq > 1 && l.quantity < l.moq))
  const ratio = budgetTotal ? Math.min(100, Math.round((totals.total / budgetTotal) * 100)) : 0

  function add(product: CatalogueResult) {
    if (lines.some((l) => l.product_id === product.product_id)) return
    setLines((current) => [...current, { ...product, quantity: Math.max(product.moq, 1), notes: '' }])
    setQuantityText((q) => ({ ...q, [product.product_id]: String(Math.max(product.moq, 1)) }))
    setAcknowledged(false)
  }

  function remove(productId: string) {
    setLines((current) => current.filter((l) => l.product_id !== productId))
    setAcknowledged(false)
  }

  function payload() {
    return parsed.map((l) => ({ product_id: l.product_id, quantity: l.quantity, notes: l.notes }))
  }

  function run(kind: 'save' | 'submit') {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const result =
          kind === 'save'
            ? await saveSelection(requirementId, payload())
            : await submitSelection(requirementId, payload(), acknowledged)
        if ('error' in result) setMessage({ kind: 'error', text: result.error })
        else {
          setMessage({ kind: 'ok', text: result.message || 'Done.' })
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please check your connection and try again.' })
      }
    })
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const term = search.trim()
    router.replace(term ? `${pathname}?q=${encodeURIComponent(term)}` : pathname, { scroll: false })
  }

  const needsAck = status === 'over'
  const canSubmit = editable && !pending && parsed.length > 0 && !invalid && (!needsAck || acknowledged)

  return (
    <section className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div>
        <h2 className="font-serif text-lg">Product selection</h2>
        {!editable && stage !== 'selection_submitted' && stage !== 'selection_approved' ? (
          <p className="mt-1 text-sm text-gray-500">Product selection opens after you confirm the approved requirement.</p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg bg-[#F5F7FA] p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-gray-600">
            Estimated total <strong className="text-gray-900">{formatCurrency(totals.total)}</strong>
            {budgetTotal ? <> of <strong className="text-gray-900">{formatCurrency(budgetTotal)}</strong> approved budget</> : null}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${INDICATOR[status].className}`}>{INDICATOR[status].label}</span>
        </div>
        {budgetTotal ? (
          <div className="h-2 overflow-hidden rounded-full bg-white" aria-hidden>
            <div className={`h-full ${status === 'over' ? 'bg-red-500' : status === 'near' ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${ratio}%` }} />
          </div>
        ) : null}
        <p className="text-xs text-gray-500">
          {totals.units} units across {lines.length} product{lines.length === 1 ? '' : 's'}. Prices exclude taxes and delivery; the final amount is confirmed in your quotation.
        </p>
      </div>

      {lines.length === 0 ? <p className="text-sm text-gray-500">No products selected yet.</p> : null}
      <ul className="space-y-3">
        {parsed.map((line) => {
          const belowMoq = line.moq > 1 && line.quantity < line.moq
          return (
            <li key={line.product_id} className="flex gap-3 rounded-lg border border-[#E7ECF3] p-3">
              {line.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.image_url} alt={line.name} className="h-16 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
              ) : null}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{line.name}</p>
                    <p className="text-xs text-gray-500">
                      {line.sku ? `${line.sku} · ` : ''}
                      {formatCurrency(line.unit_price)} each
                      {line.moq > 1 ? ` · MOQ ${line.moq}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">{formatCurrency(line.unit_price * line.quantity)}</p>
                </div>
                {editable ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-500">
                      Qty
                      <input
                        aria-label={`Quantity for ${line.name}`}
                        className="ml-1 w-24 rounded-md border border-[#E2E8F0] px-2 py-1 text-sm"
                        inputMode="numeric"
                        value={quantityText[line.product_id] ?? ''}
                        onChange={(e) => {
                          setQuantityText((q) => ({ ...q, [line.product_id]: e.target.value.replace(/[^0-9]/g, '') }))
                          setAcknowledged(false)
                        }}
                      />
                    </label>
                    <input
                      aria-label={`Note for ${line.name}`}
                      placeholder="Note (colour, branding…)"
                      maxLength={300}
                      className="min-w-0 flex-1 rounded-md border border-[#E2E8F0] px-2 py-1 text-sm"
                      value={lines.find((l) => l.product_id === line.product_id)?.notes || ''}
                      onChange={(e) =>
                        setLines((current) => current.map((l) => (l.product_id === line.product_id ? { ...l, notes: e.target.value } : l)))
                      }
                    />
                    <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => remove(line.product_id)}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Qty {line.quantity}
                    {line.notes ? ` · ${line.notes}` : ''}
                  </p>
                )}
                {editable && line.quantity < 1 ? <p className="text-xs text-red-700">Enter a quantity of at least 1.</p> : null}
                {editable && belowMoq && line.quantity >= 1 ? <p className="text-xs text-red-700">Minimum order quantity is {line.moq}.</p> : null}
              </div>
            </li>
          )
        })}
      </ul>

      {editable ? (
        <>
          {needsAck ? (
            <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>
                This selection is above the approved budget by {formatCurrency(totals.total - (budgetTotal || 0))}. I understand and want to
                submit it anyway.
              </span>
            </label>
          ) : null}
          {message ? (
            <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>
              {message.text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending || invalid}
              onClick={() => run('save')}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-[#F5F7FA] disabled:opacity-60 sm:w-auto"
            >
              Save selection
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => run('submit')}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60 sm:w-auto"
            >
              {pending ? 'Working…' : 'Submit selection for approval'}
            </button>
          </div>

          <div className="space-y-3 border-t border-[#E7ECF3] pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Add products</h3>
            <form onSubmit={runSearch} className="flex gap-2">
              <input
                aria-label="Search products"
                className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                placeholder="Search by name or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold text-gray-700 hover:bg-[#F5F7FA]">
                Search
              </button>
            </form>
            <ul className="grid gap-2 sm:grid-cols-2">
              {results.map((product) => {
                const already = lines.some((l) => l.product_id === product.product_id)
                return (
                  <li key={product.product_id} className="flex items-center gap-3 rounded-lg border border-[#E7ECF3] p-2">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.name} className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(product.unit_price)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => add(product)}
                      className="shrink-0 rounded-md bg-[#F5F7FA] px-3 py-1.5 text-xs font-semibold text-[#9C7A33] hover:bg-[#EEF1F6] disabled:opacity-50"
                    >
                      {already ? 'Added' : 'Add'}
                    </button>
                  </li>
                )
              })}
              {results.length === 0 ? <li className="text-sm text-gray-500">No matching products.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </section>
  )
}
