'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveBanner } from './actions'
import type { BannerInput } from '@/lib/site/banner-rules'

const input = 'mt-1 w-full rounded-lg border px-3 py-2 text-sm'

export const EMPTY_BANNER: BannerInput = {
  title: '',
  subtitle: '',
  cta_label: '',
  link_url: '',
  image_url: '',
  occasion: '',
  audience: 'both',
  starts_on: '',
  ends_on: '',
  is_active: true,
  sort_order: '0',
}

export function BannerForm({ id, initial, canEdit }: { id: string | null; initial: BannerInput; canEdit: boolean }) {
  const router = useRouter()
  const [values, setValues] = useState<BannerInput>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof BannerInput, string>>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (key: keyof BannerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setErrors({})
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await saveBanner(id, values)
        if ('error' in res) {
          setMessage({ kind: 'error', text: res.error })
          if (res.fieldErrors) setErrors(res.fieldErrors)
          return
        }
        setMessage({ kind: 'ok', text: 'Banner saved.' })
        if (!id) setValues(EMPTY_BANNER)
        router.refresh()
        if (id) router.push('/crm/banners')
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }

  const err = (key: keyof BannerInput) => (errors[key] ? <span role="alert" className="mt-1 block text-xs text-red-700">{errors[key]}</span> : null)

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 text-xs" noValidate>
      <h2 className="text-sm font-bold text-gray-900">{id ? 'Edit banner' : 'New banner'}</h2>
      <label className="block font-medium text-gray-700">Occasion (optional label, e.g. Diwali)
        <input className={input} value={values.occasion} onChange={set('occasion')} maxLength={60} />
        {err('occasion')}
      </label>
      <label className="block font-medium text-gray-700">Headline
        <input className={input} value={values.title} onChange={set('title')} maxLength={120} />
        {err('title')}
      </label>
      <label className="block font-medium text-gray-700">Subtitle (optional)
        <textarea className={input} rows={2} value={values.subtitle} onChange={set('subtitle')} maxLength={240} />
        {err('subtitle')}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-medium text-gray-700">Button label (optional)
          <input className={input} value={values.cta_label} onChange={set('cta_label')} maxLength={40} />
          {err('cta_label')}
        </label>
        <label className="block font-medium text-gray-700">Link (/catalogue or https://…)
          <input className={input} value={values.link_url} onChange={set('link_url')} maxLength={500} />
          {err('link_url')}
        </label>
      </div>
      <label className="block font-medium text-gray-700">Background image address (optional, https://…)
        <input className={input} value={values.image_url} onChange={set('image_url')} maxLength={500} />
        {err('image_url')}
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block font-medium text-gray-700">Show on
          <select className={input} value={values.audience} onChange={set('audience')}>
            <option value="both">Public site and client portal</option>
            <option value="public">Public site only</option>
            <option value="portal">Client portal only</option>
          </select>
          {err('audience')}
        </label>
        <label className="block font-medium text-gray-700">Starts on
          <input className={input} type="date" value={values.starts_on} onChange={set('starts_on')} />
          {err('starts_on')}
        </label>
        <label className="block font-medium text-gray-700">Ends on
          <input className={input} type="date" value={values.ends_on} onChange={set('ends_on')} />
          {err('ends_on')}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-medium text-gray-700">Display order (lower first)
          <input className={input} inputMode="numeric" value={values.sort_order} onChange={set('sort_order')} />
          {err('sort_order')}
        </label>
        <label className="flex items-center gap-2 pt-6 font-medium text-gray-700">
          <input type="checkbox" checked={values.is_active} onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))} />
          Active
        </label>
      </div>
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-red-700' : 'text-green-700'}>{message.text}</p> : null}
      <button disabled={pending || !canEdit} className="min-h-10 rounded-lg bg-[#9C7A33] px-4 font-semibold text-white disabled:opacity-60">
        {pending ? 'Saving…' : id ? 'Save changes' : 'Create banner'}
      </button>
    </form>
  )
}
