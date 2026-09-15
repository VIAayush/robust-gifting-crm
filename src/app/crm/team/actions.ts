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

  const { error } = await supabase.from('profiles').update({
    role,
    is_active: isActive,
    department_id: departmentId,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm/team')
  return { success: true }
}
