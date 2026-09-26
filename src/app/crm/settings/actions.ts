'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateOrgSettings(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: 'Admin only' }

  const amount = (key: string) => {
    const raw = String(formData.get(key) || '').trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }
  const tax = amount('default_tax_percent')
  const deliveryCharge = amount('delivery_charge')
  const freeAbove = amount('free_delivery_above')
  if ([tax, deliveryCharge, freeAbove].some((v) => Number.isNaN(v))) {
    return { error: 'Amounts must be zero or a positive number' }
  }

  // organisation_name / default_tax_percent are NOT NULL - an emptied field keeps a sane default rather than failing the save.
  const payload = {
    organisation_name: String(formData.get('organisation_name') || '').trim() || 'Robust Gifting',
    default_tax_percent: tax ?? 18,
    currency: String(formData.get('currency') || 'INR'),
    delivery_charge: deliveryCharge ?? 0,
    free_delivery_above: freeAbove,
  }

  const { data: existing } = await supabase.from('org_settings').select('id').limit(1).maybeSingle()
  const error = existing
    ? (await supabase.from('org_settings').update(payload).eq('id', existing.id)).error
    : (await supabase.from('org_settings').insert(payload)).error
  if (error) return { error: error.message }
  revalidatePath('/crm/settings')
  return { success: true }
}
