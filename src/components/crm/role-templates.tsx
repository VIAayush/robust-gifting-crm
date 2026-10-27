'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyRoleTemplate } from '@/app/crm/settings/permissions/actions'
import { ROLE_TEMPLATES } from '@/lib/role-templates'

export function RoleTemplates({ ready }: { ready: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function apply(key: string, label: string) {
    if (pending) return
    setMessage(null)
    const data = new FormData()
    data.set('template', key)
    startTransition(async () => {
      try {
        const res = await applyRoleTemplate(data)
        if ('error' in res && res.error) setMessage({ kind: 'error', text: res.error })
        else if ('added' in res) {
          setMessage({ kind: 'ok', text: `${label} template applied: ${res.added} permission${res.added === 1 ? '' : 's'} added, ${res.removed} removed.` })
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      } finally {
        setConfirming(null)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-900">Role templates</h2>
      <p className="mt-1 text-xs text-gray-500">
        Apply a preset to a role in one click. The role will hold exactly the preset permissions; anything extra is removed. Admin always has everything and has no template.
      </p>
      {!ready ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Templates become available after the latest database migration is applied.</p> : null}
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROLE_TEMPLATES.map((template) => (
          <div key={template.key} className="rounded-xl border border-gray-200 p-3 text-xs">
            <p className="font-semibold text-gray-900">
              {template.label} <span className="font-normal text-gray-400">· role: {template.role}</span>
            </p>
            <p className="mt-1 text-gray-600">{template.summary}</p>
            <p className="mt-1 text-gray-400">{template.modules.length} modules, {template.actions.length} actions</p>
            {confirming === template.key ? (
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={pending || !ready} onClick={() => apply(template.key, template.label)} className="min-h-9 rounded-lg bg-[#9C7A33] px-3 font-semibold text-white disabled:opacity-60">
                  {pending ? 'Applying…' : `Replace ${template.role} permissions`}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="min-h-9 rounded-lg border px-3 font-semibold text-gray-700">Cancel</button>
              </div>
            ) : (
              <button type="button" disabled={!ready} onClick={() => setConfirming(template.key)} className="mt-3 min-h-9 rounded-lg border px-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Apply template
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
