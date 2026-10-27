import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isBannerLive, todayInIndia } from '@/lib/site/banner-rules'
import { BannerForm, EMPTY_BANNER } from './banner-form'
import { BannerRowActions } from './banner-row-actions'

export const metadata = { title: 'Banners' }

type Row = {
  id: string
  title: string
  subtitle: string | null
  cta_label: string | null
  link_url: string | null
  image_url: string | null
  occasion: string | null
  audience: string
  starts_on: string | null
  ends_on: string | null
  is_active: boolean
  sort_order: number
}

const AUDIENCE: Record<string, string> = { both: 'Public site + portal', public: 'Public site', portal: 'Client portal' }

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const profile = await requireStaff()
  const { edit } = await searchParams
  const canEdit = profile.role === 'admin' || profile.role === 'sales'
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('site_banners')
    .select('id, title, subtitle, cta_label, link_url, image_url, occasion, audience, starts_on, ends_on, is_active, sort_order')
    .order('sort_order')
    .order('created_at', { ascending: false })
  const banners = (data || []) as Row[]
  const today = todayInIndia()
  const editing = edit ? banners.find((b) => b.id === edit) || null : null

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Festival &amp; occasion banners</h1>
        <p className="mt-1 text-xs text-gray-500">
          Banners appear at the top of the public home pages and the client portal catalogue while they are active and inside their dates. Changes show within about a minute.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          Banners are not available yet: the latest database migration has not been applied. Nothing is shown to customers until it is.
        </div>
      ) : (
        <>
          <BannerForm
            key={editing?.id || 'new'}
            id={editing?.id || null}
            canEdit={canEdit}
            initial={
              editing
                ? {
                    title: editing.title,
                    subtitle: editing.subtitle || '',
                    cta_label: editing.cta_label || '',
                    link_url: editing.link_url || '',
                    image_url: editing.image_url || '',
                    occasion: editing.occasion || '',
                    audience: editing.audience,
                    starts_on: editing.starts_on || '',
                    ends_on: editing.ends_on || '',
                    is_active: editing.is_active,
                    sort_order: String(editing.sort_order),
                  }
                : EMPTY_BANNER
            }
          />
          {!canEdit ? <p className="text-xs text-gray-500">Your role can view banners but not change them.</p> : null}

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-gray-900">All banners</h2>
            {banners.length === 0 ? (
              <p className="text-xs text-gray-400">No banners yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {banners.map((banner) => {
                  const live = isBannerLive(banner, today)
                  const status = !banner.is_active ? 'Hidden' : live ? 'Live' : banner.starts_on && banner.starts_on > today ? 'Scheduled' : 'Expired'
                  return (
                    <li key={banner.id} className="flex flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {banner.title}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === 'Live' ? 'bg-green-50 text-green-700' : status === 'Scheduled' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{status}</span>
                        </p>
                        <p className="text-gray-500">
                          {AUDIENCE[banner.audience] || banner.audience}
                          {banner.occasion ? ` · ${banner.occasion}` : ''}
                          {banner.starts_on || banner.ends_on ? ` · ${banner.starts_on || 'any time'} to ${banner.ends_on || 'no end'}` : ''}
                        </p>
                      </div>
                      <BannerRowActions id={banner.id} active={banner.is_active} canEdit={canEdit} />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
