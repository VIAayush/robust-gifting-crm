'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeQuotationItem, saveQuotationHeader, saveQuotationItem } from '../actions'

export type EditorItem = { id: string; name: string; note?: string | null; sku: string | null; quantity: number; unit_price: number; discount_percent: number; tax_percent: number }

const input = 'w-full rounded-md border px-2 py-1.5 text-xs'

type Result = { success: true } | { error: string }

export function QuotationEditor({
  quotationId,
  items,
  header,
}: {
  quotationId: string
  items: EditorItem[]
  header: { tax_percent: number; discount_percent: number; valid_until: string; notes: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [rows, setRows] = useState(() => Object.fromEntries(items.map((i) => [i.id, { quantity: String(i.quantity), unit_price: String(i.unit_price), discount_percent: String(i.discount_percent), tax_percent: String(i.tax_percent) }])))
  const [terms, setTerms] = useState({ tax_percent: String(header.tax_percent), discount_percent: String(header.discount_percent), valid_until: header.valid_until, notes: header.notes })
  const [add, setAdd] = useState({ sku: '', quantity: '1', unit_price: '', discount_percent: '0', tax_percent: '18' })

  function run(task: () => Promise<Result>, ok: string, after?: () => void) {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await task()
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({ kind: 'ok', text: ok })
          after?.()
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[#9C7A33]/40 bg-white p-5 text-xs shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Edit draft quotation</h3>
        <p className="text-gray-500">Change quantities, prices, discount and tax. Totals are recalculated automatically. Once the quotation is sent it can no longer be edited.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-[10px] uppercase text-gray-500"><tr><th className="py-2">Item</th><th>Qty</th><th>Unit price</th><th>Disc %</th><th>Tax %</th><th /></tr></thead>
          <tbody>
            {items.map((item) => {
              const row = rows[item.id]
              const set = (key: keyof typeof row) => (e: React.ChangeEvent<HTMLInputElement>) => setRows((r) => ({ ...r, [item.id]: { ...r[item.id], [key]: e.target.value } }))
              return (
                <tr key={item.id} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-2"><span className="font-semibold text-gray-900">{item.name}</span>{item.sku ? <span className="ml-1 font-mono text-gray-400">{item.sku}</span> : null}{item.note ? <div className="mt-1 text-[11px] italic text-gray-600">Note: {item.note}</div> : null}</td>
                  <td className="pr-2"><input aria-label={`Quantity for ${item.name}`} className={input} inputMode="numeric" value={row.quantity} onChange={set('quantity')} /></td>
                  <td className="pr-2"><input aria-label={`Unit price for ${item.name}`} className={input} inputMode="decimal" value={row.unit_price} onChange={set('unit_price')} /></td>
                  <td className="pr-2"><input aria-label={`Discount for ${item.name}`} className={input} inputMode="decimal" value={row.discount_percent} onChange={set('discount_percent')} /></td>
                  <td className="pr-2"><input aria-label={`Tax for ${item.name}`} className={input} inputMode="decimal" value={row.tax_percent} onChange={set('tax_percent')} /></td>
                  <td className="whitespace-nowrap">
                    <button type="button" disabled={pending} onClick={() => run(() => saveQuotationItem(quotationId, item.id, row), 'Item saved.')} className="rounded-md border px-2 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Save</button>
                    <button type="button" disabled={pending} onClick={() => run(() => removeQuotationItem(quotationId, item.id), 'Item removed.')} className="ml-1 rounded-md border px-2 py-1.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        <label className="sm:col-span-2 font-medium text-gray-700">Add product by SKU<input className={`${input} mt-1`} value={add.sku} onChange={(e) => setAdd((a) => ({ ...a, sku: e.target.value }))} /></label>
        <label className="font-medium text-gray-700">Qty<input className={`${input} mt-1`} inputMode="numeric" value={add.quantity} onChange={(e) => setAdd((a) => ({ ...a, quantity: e.target.value }))} /></label>
        <label className="font-medium text-gray-700">Unit price<input className={`${input} mt-1`} inputMode="decimal" placeholder="List price" value={add.unit_price} onChange={(e) => setAdd((a) => ({ ...a, unit_price: e.target.value }))} /></label>
        <label className="font-medium text-gray-700">Disc %<input className={`${input} mt-1`} inputMode="decimal" value={add.discount_percent} onChange={(e) => setAdd((a) => ({ ...a, discount_percent: e.target.value }))} /></label>
        <div className="flex items-end"><button type="button" disabled={pending || !add.sku.trim()} onClick={() => run(() => saveQuotationItem(quotationId, null, add), 'Item added.', () => setAdd({ sku: '', quantity: '1', unit_price: '', discount_percent: '0', tax_percent: '18' }))} className="min-h-9 w-full rounded-md bg-[#9C7A33] px-3 font-semibold text-white disabled:opacity-60">Add item</button></div>
      </div>

      <div className="grid gap-2 border-t pt-4 sm:grid-cols-4">
        <label className="font-medium text-gray-700">Tax % (GST)<input className={`${input} mt-1`} inputMode="decimal" value={terms.tax_percent} onChange={(e) => setTerms((t) => ({ ...t, tax_percent: e.target.value }))} /></label>
        <label className="font-medium text-gray-700">Overall discount %<input className={`${input} mt-1`} inputMode="decimal" value={terms.discount_percent} onChange={(e) => setTerms((t) => ({ ...t, discount_percent: e.target.value }))} /></label>
        <label className="font-medium text-gray-700">Valid until<input className={`${input} mt-1`} type="date" value={terms.valid_until} onChange={(e) => setTerms((t) => ({ ...t, valid_until: e.target.value }))} /></label>
        <div className="flex items-end"><button type="button" disabled={pending} onClick={() => run(() => saveQuotationHeader(quotationId, terms), 'Terms saved.')} className="min-h-9 w-full rounded-md border px-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Save terms</button></div>
        <label className="font-medium text-gray-700 sm:col-span-4">Proposal notes (shown to the client, so keep internal remarks out)
          <textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={terms.notes} onChange={(e) => setTerms((t) => ({ ...t, notes: e.target.value }))} />
        </label>
      </div>

      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-red-700' : 'text-green-700'}>{message.text}</p> : null}
    </section>
  )
}
