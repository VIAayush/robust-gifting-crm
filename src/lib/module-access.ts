import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { CRM_MODULES, MODULE_PERMISSION_PREFIX, defaultModulesForRole, moduleByKey } from '@/lib/modules'

/**
 * Module keys the signed-in staff member may open. Admin gets everything.
 * Until the module rows exist in role_permissions (migration not yet run),
 * every role keeps exactly the modules it has today.
 */
export const getAllowedModules = cache(async (): Promise<{ role: string | null; modules: Set<string> }> => {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { role: null, modules: new Set() }
  if (profile.role === 'admin') return { role: profile.role, modules: new Set(CRM_MODULES.map((m) => m.key)) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('role, permission_key')
    .like('permission_key', `${MODULE_PERMISSION_PREFIX}%`)
  if (error || !data || data.length === 0) {
    return { role: profile.role, modules: new Set(defaultModulesForRole(profile.role)) }
  }
  const granted = new Set(
    data.filter((row) => row.role === profile.role).map((row) => String(row.permission_key).slice(MODULE_PERMISSION_PREFIX.length)),
  )
  // A module can never exceed what the role is eligible for (page guards + RLS are role-based).
  const modules = new Set(
    CRM_MODULES.filter((m) => granted.has(m.key) && (m.eligibleRoles as string[]).includes(profile.role)).map((m) => m.key),
  )
  return { role: profile.role, modules }
})

/** Server-side gate for a CRM module (used by each module's layout). */
export async function requireModule(key: string) {
  const mod = moduleByKey(key)
  if (!mod) return
  const { role, modules } = await getAllowedModules()
  if (!role) redirect('/login')
  if (role === 'client_admin' || role === 'client_user') redirect('/portal')
  if (!modules.has(key)) redirect(`/crm/access-denied?module=${encodeURIComponent(key)}`)
}
