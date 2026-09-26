'use client'

import { useState, useTransition } from 'react'
import { toggleRolePermission } from '@/app/crm/settings/permissions/actions'

const ROLE_LABELS: Record<string, string> = {
  sales: 'Sales',
  operations: 'Operations / Procurement',
  accounts: 'Accounts / Finance',
  management: 'Management',
}

type Permission = { key: string; module: string; description: string | null }

export function PermissionMatrix({
  roles,
  permissions,
  granted,
}: {
  roles: readonly string[]
  permissions: Permission[]
  granted: string[]
}) {
  const [grantedSet, setGrantedSet] = useState(() => new Set(granted))
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const modules = Array.from(new Set(permissions.map((p) => p.module)))

  function toggle(role: string, key: string) {
    const cellKey = `${role}:${key}`
    const nextGrant = !grantedSet.has(cellKey)
    setPendingKey(cellKey)
    setError(null)
    setGrantedSet((prev) => {
      const next = new Set(prev)
      if (nextGrant) next.add(cellKey)
      else next.delete(cellKey)
      return next
    })
    startTransition(async () => {
      const fd = new FormData()
      fd.set('role', role)
      fd.set('permission_key', key)
      fd.set('grant', String(nextGrant))
      const res = await toggleRolePermission(fd)
      setPendingKey(null)
      if (res && 'error' in res) {
        setError(res.error)
        // revert on failure
        setGrantedSet((prev) => {
          const next = new Set(prev)
          if (nextGrant) next.delete(cellKey)
          else next.add(cellKey)
          return next
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {modules.map((module) => (
        <div key={module} className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
              <tr>
                <th className="p-3 capitalize">{module}</th>
                {roles.map((r) => (
                  <th key={r} className="p-3 text-center">{ROLE_LABELS[r] || r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.filter((p) => p.module === module).map((p) => (
                <tr key={p.key} className="border-t border-gray-100">
                  <td className="p-3">
                    <p className="font-mono font-semibold text-gray-800">{p.key}</p>
                    {p.description && <p className="text-[10px] text-gray-400">{p.description}</p>}
                  </td>
                  {roles.map((role) => {
                    const cellKey = `${role}:${p.key}`
                    const checked = grantedSet.has(cellKey)
                    return (
                      <td key={role} className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={pendingKey === cellKey}
                          onChange={() => toggle(role, p.key)}
                          className="h-4 w-4 accent-[#9C7A33]"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
