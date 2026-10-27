'use server'

import { createClient } from '@/lib/supabase/server'
import { moduleActionGuard } from '@/lib/module-access'
import { revalidatePath } from 'next/cache'

// Valid values of the database enum activity_status. (An earlier version inserted 'open', which the enum rejects.)
const ACTIVITY_STATUSES = ['upcoming', 'completed', 'missed']
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'follow_up', 'message']
const activityType = (value: FormDataEntryValue | null) => (ACTIVITY_TYPES.includes(String(value || '')) ? String(value) : 'follow_up')

export async function logActivity(formData: FormData) {
  const moduleAccess = await moduleActionGuard('activities')
  if (!moduleAccess.ok) return { error: moduleAccess.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const title = String(formData.get('title') || '').trim()
  if (!title) return { error: 'Title is required' }

  const relatedType = String(formData.get('related_type') || '') || null
  const relatedId = String(formData.get('related_id') || '') || null

  const { error } = await supabase.from('activities').insert({
    title,
    type: activityType(formData.get('type')),
    due_at: String(formData.get('due_at') || '') || null,
    assigned_to: String(formData.get('assigned_to') || '') || user.id,
    related_type: relatedType,
    related_id: relatedId,
    status: 'upcoming',
    notes: String(formData.get('notes') || '') || null,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/crm/activities')
  revalidatePath('/crm/my-work')
  if (relatedType === 'requirement' && relatedId) revalidatePath(`/crm/requirements/${relatedId}`)
  return { success: true }
}

export async function updateActivity(formData: FormData) {
  const moduleAccess = await moduleActionGuard('activities')
  if (!moduleAccess.ok) return { error: moduleAccess.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = String(formData.get('id') || '')
  const title = String(formData.get('title') || '').trim()
  if (!id || !title) return { error: 'Title is required' }

  const { error } = await supabase.from('activities').update({
    title,
    type: activityType(formData.get('type')),
    notes: String(formData.get('notes') || '') || null,
    status: ACTIVITY_STATUSES.includes(String(formData.get('status') || '')) ? String(formData.get('status')) : 'upcoming',
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm/activities')
  return { success: true }
}

export async function removeActivity(formData: FormData) {
  const moduleAccess = await moduleActionGuard('activities')
  if (!moduleAccess.ok) return { error: moduleAccess.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Activity is required' }
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm/activities')
  return { success: true }
}
