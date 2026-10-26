'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCatalogueCompanies } from '@/app/crm/products/catalogues/actions'
import { Feedback } from '@/components/catalogues/catalogue-controls'

export function CompanyAssigner({
  campaignId,
  companies,
  assignedIds,
  canEdit,
}: {
  campaignId: string
  companies: { id: string; name: string }[]
  assignedIds: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(() => new Set(assignedIds))
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? companies.filter((c) => c.name.toLowerCase().includes(needle)) : companies
  }, [companies, query])
  const dirty = selected.size !== assignedIds.length || assignedIds.some((id) => !selected.has(id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies"
          aria-label="Search companies"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-3 text-sm"
        />
        {canEdit ? (
          <button
            type="button"
            onClick={() => setSelected((prev) => new Set([...prev, ...shown.map((c) => c.id)]))}
            className="min-h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Select all shown
          </button>
        ) : null}
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#E2E8F0] p-2">
        {shown.length === 0 ? <p className="p-2 text-xs text-gray-500">No companies match.</p> : null}
        {shown.map((company) => (
          <label key={company.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected.has(company.id)}
              disabled={!canEdit || pending}
              onChange={() => toggle(company.id)}
              className="h-4 w-4 accent-[#9C7A33]"
            />
            {company.name}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        {selected.size} selected. Individual (B2C) customers are not listed: catalogues are for corporate clients.
      </p>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={() => {
              setResult(null)
              startTransition(async () => {
                const res = await setCatalogueCompanies(campaignId, Array.from(selected))
                if (res.error) setResult({ ok: false, text: res.error })
                else {
                  setResult({ ok: true, text: res.message || 'Saved.' })
                  router.refresh()
                }
              })
            }}
            className="inline-flex min-h-9 items-center rounded-lg bg-[#9C7A33] px-4 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save companies'}
          </button>
          <Feedback result={result} />
        </div>
      ) : null}
    </div>
  )
}
