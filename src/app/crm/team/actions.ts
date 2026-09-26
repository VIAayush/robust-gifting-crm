'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateTeamMember(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: 'Admin only' }

  const id = String(formData.get('id') || '')
  const role = String(formData.get('role') || '')
  const isActive = String(formData.get('is_active') || '') === 'true'
  const departmentId = String(formData.get('department_id') || '') || null
  if (!id) return { error: 'Member required' }
  // Only internal roles can be assigned here - a staff record must never be turned into a client login from this screen.
  if (!['admin', 'sales', 'operations', 'accounts', 'management'].includes(role)) return { error: 'Invalid role' }
  if (id === user.id && (role !== 'admin' || !isActive)) return { error: 'You cannot remove your own admin access' }

  const update: Record<string, unknown> = { role, is_active: isActive, department_id: departmentId }
  if (formData.has('phone')) {
    const phone = String(formData.get('phone') || '').trim()
    if (phone && phone.replace(/\D/g, '').length < 10) return { error: 'Phone number looks too short' }
    update.phone = phone || null
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm/team')
  return { success: true }
}
