import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BackButton } from '@/components/ui/back-button'
import { PermissionMatrix } from '@/components/crm/permission-matrix'
import { ModuleMatrix } from '@/components/crm/module-matrix'
import { MODULE_PERMISSION_PREFIX, defaultModulesForRole, modulePermissionKey } from '@/lib/modules'

const ROLES = ['admin', 'sales', 'operations', 'accounts', 'management'] as const

export default async function PermissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        You must be an administrator to manage permissions.
      </div>
    )
  }

  const [{ data: permissions }, { data: rolePermissions }] = await Promise.all([
    supabase.from('permissions').select('key, module, description').order('module').order('key'),
    supabase.from('role_permissions').select('role, permission_key'),
  ])

  const granted = (rolePermissions || []).map((r) => `${r.role}:${r.permission_key}`)
  const actionPermissions = (permissions || []).filter((p) => !p.key.startsWith(MODULE_PERMISSION_PREFIX))
  const moduleRowsReady = (permissions || []).some((p) => p.key.startsWith(MODULE_PERMISSION_PREFIX))
  // Before the migration runs, show today's defaults (read-only) so the matrix reflects real access.
  const moduleGranted = moduleRowsReady
    ? granted.filter((g) => g.includes(`:${MODULE_PERMISSION_PREFIX}`))
    : ROLES.filter((r) => r !== 'admin').flatMap((role) => defaultModulesForRole(role).map((key) => `${role}:${modulePermissionKey(key)}`))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackButton href="/crm/settings" label="Back to Settings" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Role permissions</h1>
        <p className="mt-1 text-xs text-gray-500">
          Admin always has every permission. Control which CRM modules each role can open, and what each role can do with
          suppliers, procurement, pricing and notifications.
        </p>
      </div>
      <ModuleMatrix roles={ROLES.filter((r) => r !== 'admin')} granted={moduleGranted} ready={moduleRowsReady} />
      <PermissionMatrix
        roles={ROLES.filter((r) => r !== 'admin')}
        permissions={actionPermissions}
        granted={granted}
      />
    </div>
  )
}
