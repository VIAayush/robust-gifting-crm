'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/permissions'

export async function toggleRolePermission(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'permissions.manage')
  if ('error' in access) return access

  const role = String(formData.get('role') || '')
  const permissionKey = String(formData.get('permission_key') || '')
  const grant = String(formData.get('grant') || '') === 'true'
  if (!role || !permissionKey) return { error: 'Role and permission are required' }
  if (role === 'admin') return { error: 'Admin always has every permission and cannot be changed' }

  if (grant) {
    const { error } = await supabase.from('role_permissions').insert({ role, permission_key: permissionKey })
    if (error && error.code !== '23505') return { error: error.message }
  } else {
    const { error } = await supabase.from('role_permissions').delete().eq('role', role).eq('permission_key', permissionKey)
    if (error) return { error: error.message }
  }

  await writeAudit(supabase, {
    action: grant ? 'grant_permission' : 'revoke_permission',
    entity: 'role_permissions',
    entityId: null,
    next: { role, permission_key: permissionKey, grant },
    userId: access.profile.id,
  })
  revalidatePath('/crm/settings/permissions')
  return { success: true }
}
