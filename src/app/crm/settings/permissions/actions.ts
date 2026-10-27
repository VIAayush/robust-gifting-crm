'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/permissions'
import { MODULE_PERMISSION_PREFIX, moduleByKey } from '@/lib/modules'
import { diffTemplate, roleTemplateByKey } from '@/lib/role-templates'

export async function toggleRolePermission(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'permissions.manage')
  if ('error' in access) return access

  const role = String(formData.get('role') || '')
  const permissionKey = String(formData.get('permission_key') || '')
  const grant = String(formData.get('grant') || '') === 'true'
  if (!role || !permissionKey) return { error: 'Role and permission are required' }
  if (role === 'admin') return { error: 'Admin always has every permission and cannot be changed' }
  if (permissionKey.startsWith(MODULE_PERMISSION_PREFIX)) {
    const mod = moduleByKey(permissionKey.slice(MODULE_PERMISSION_PREFIX.length))
    if (!mod) return { error: 'Unknown module' }
    if (grant && !(mod.eligibleRoles as string[]).includes(role)) {
      return { error: `${mod.label} can't be given to this role: its pages and data are not available to it.` }
    }
  }

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
  revalidatePath('/crm', 'layout')
  return { success: true }
}

/**
 * One-click role template: makes the template's role hold exactly the template's module and action
 * permissions (extra grants are removed). Admin-only (permissions.manage), audited, and refuses to
 * run before the module permission rows exist so a template can never half-apply.
 */
export async function applyRoleTemplate(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'permissions.manage')
  if ('error' in access) return access

  const template = roleTemplateByKey(String(formData.get('template') || ''))
  if (!template) return { error: 'Unknown role template' }

  const wantedKeys = [...template.modules.map((key) => `${MODULE_PERMISSION_PREFIX}${key}`), ...template.actions]
  const { data: known } = await supabase.from('permissions').select('key').in('key', wantedKeys)
  const knownKeys = new Set((known || []).map((row) => row.key as string))
  const missing = wantedKeys.filter((key) => !knownKeys.has(key))
  if (missing.length > 0) {
    return { error: 'Role templates need the latest database migration (module permissions). Nothing was changed.' }
  }

  const { data: current, error: readError } = await supabase.from('role_permissions').select('permission_key').eq('role', template.role)
  if (readError) return { error: 'Could not read the current permissions. Nothing was changed.' }
  const diff = diffTemplate(template, (current || []).map((row) => row.permission_key as string))

  if (diff.add.length > 0) {
    const { error } = await supabase.from('role_permissions').upsert(diff.add.map((permission_key) => ({ role: template.role, permission_key })), { onConflict: 'role,permission_key', ignoreDuplicates: true })
    if (error) return { error: 'Could not apply the template. Some changes may not have been made; apply it again.' }
  }
  if (diff.remove.length > 0) {
    const { error } = await supabase.from('role_permissions').delete().eq('role', template.role).in('permission_key', diff.remove)
    if (error) return { error: 'Could not remove the extra permissions. Apply the template again.' }
  }

  await writeAudit(supabase, {
    action: 'apply_role_template',
    entity: 'role_permissions',
    entityId: null,
    next: { role: template.role, template: template.key, added: diff.add.length, removed: diff.remove.length },
    userId: access.profile.id,
  })
  revalidatePath('/crm/settings/permissions')
  revalidatePath('/crm', 'layout')
  return { success: true, added: diff.add.length, removed: diff.remove.length }
}
