import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BackButton } from '@/components/ui/back-button'
import { PermissionMatrix } from '@/components/crm/permission-matrix'

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackButton href="/crm/settings" label="Back to Settings" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Role permissions</h1>
        <p className="mt-1 text-xs text-gray-500">
          Admin always has every permission. Toggle what each other role can do with suppliers and procurement.
        </p>
      </div>
      <PermissionMatrix
        roles={ROLES.filter((r) => r !== 'admin')}
        permissions={permissions || []}
        granted={granted}
      />
    </div>
  )
}
