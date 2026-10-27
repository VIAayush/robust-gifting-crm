'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getAllowedModules } from '@/lib/module-access'
import { writeAudit } from '@/lib/audit'
import { validateBanner, type BannerInput } from '@/lib/site/banner-rules'

type Result = { success: true } | { error: string; fieldErrors?: Partial<Record<keyof BannerInput, string>> }

/** Banner writes: Catalogues module + admin or sales. RLS enforces the same on the database side. */
async function editor() {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { ok: false, error: 'Your session has expired. Please sign in again.' } as const
  const { modules } = await getAllowedModules()
  if (!modules.has('catalogues')) return { ok: false, error: 'You do not have access to banners.' } as const
  if (profile.role !== 'admin' && profile.role !== 'sales') return { ok: false, error: 'Your role can view banners but not change them.' } as const
  return { ok: true, profile, supabase: await createClient() } as const
}

function refresh() {
  revalidatePath('/crm/banners')
  revalidatePath('/')
  revalidatePath('/home')
  revalidatePath('/personalized')
  revalidatePath('/portal/catalogue')
}

function friendly(message: string) {
  if (/relation .*site_banners.* does not exist|site_banners/.test(message) && /exist|schema cache/.test(message)) {
    return 'Banners need the latest database migration. Nothing was saved.'
  }
  return 'We could not save the banner. Please try again.'
}

export async function saveBanner(id: string | null, input: BannerInput): Promise<Result> {
  const access = await editor()
  if (!access.ok) return { error: access.error }
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Banner not found.' }

  const checked = validateBanner(input)
  if ('errors' in checked) return { error: 'Please fix the highlighted fields.', fieldErrors: checked.errors }

  const { supabase, profile } = access
  const { error } = id
    ? await supabase.from('site_banners').update(checked.value).eq('id', id)
    : await supabase.from('site_banners').insert({ ...checked.value, created_by: profile.id })
  if (error) {
    console.error('[banners] save failed', error.message)
    return { error: friendly(error.message) }
  }
  await writeAudit(supabase, { action: id ? 'update' : 'create', entity: 'site_banners', entityId: id, next: checked.value, userId: profile.id })
  refresh()
  return { success: true }
}

export async function setBannerActive(id: string, active: boolean): Promise<Result> {
  const access = await editor()
  if (!access.ok) return { error: access.error }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Banner not found.' }
  const { error } = await access.supabase.from('site_banners').update({ is_active: active }).eq('id', id)
  if (error) return { error: friendly(error.message) }
  await writeAudit(access.supabase, { action: active ? 'activate' : 'deactivate', entity: 'site_banners', entityId: id, next: { is_active: active }, userId: access.profile.id })
  refresh()
  return { success: true }
}

export async function deleteBanner(id: string): Promise<Result> {
  const access = await editor()
  if (!access.ok) return { error: access.error }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Banner not found.' }
  const { error } = await access.supabase.from('site_banners').delete().eq('id', id)
  if (error) return { error: friendly(error.message) }
  await writeAudit(access.supabase, { action: 'delete', entity: 'site_banners', entityId: id, userId: access.profile.id })
  refresh()
  return { success: true }
}
