'use client'

import { useState, useTransition } from 'react'
import { toggleRolePermission } from '@/app/crm/settings/permissions/actions'
import { CRM_MODULES, modulePermissionKey } from '@/lib/modules'

const ROLE_LABELS: Record<string, string> = {
  sales: 'Sales',
  operations: 'Operations / Procurement',
  accounts: 'Accounts / Finance',
  management: 'Management',
}

/**
 * Which sidebar modules each role can open. Enforced on the server by each
 * module's layout. A cell is only toggleable when the role is eligible for
 * that module (its page guards and data rules allow it).
 */
export function ModuleMatrix({ roles, granted, ready }: { roles: readonly string[]; granted: string[]; ready: boolean }) {
  const [grantedSet, setGrantedSet] = useState(() => new Set(granted))
  const [pendingCell, setPendingCell] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const groups = Array.from(new Set(CRM_MODULES.map((m) => m.group)))

  const toggle = (role: string, moduleKey: string) => {
    const key = modulePermissionKey(moduleKey)
    const cell = `${role}:${key}`
    const nextGrant = !grantedSet.has(cell)
    setError(null)
    setPendingCell(cell)
    setGrantedSet((prev) => {
      const next = new Set(prev)
      if (nextGrant) next.add(cell)
      else next.delete(cell)
      return next
    })
    startTransition(async () => {
      const fd = new FormData()
      fd.set('role', role)
      fd.set('permission_key', key)
      fd.set('grant', String(nextGrant))
      const res = await toggleRolePermission(fd)
      setPendingCell(null)
      if (res && 'error' in res && res.error) {
        setError(res.error)
        setGrantedSet((prev) => {
          const next = new Set(prev)
          if (nextGrant) next.delete(cell)
          else next.add(cell)
          return next
        })
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">Module access</h2>
        <p className="mt-1 text-xs text-gray-500">
          Which parts of the CRM each role can open. Unticking a module hides it from the sidebar and blocks its pages on the
          server. Admin always has every module. A dash means the role&apos;s data access doesn&apos;t cover that module.
        </p>
      </div>
      {!ready ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Module access is running on the built-in defaults (everyone keeps today&apos;s access). Run the migration
          <code className="mx-1">20261026_module_permissions_and_catalogues.sql</code> to make these switches editable.
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2 pr-3">Module</th>
              {roles.map((role) => (
                <th key={role} className="px-2 py-2 text-center">
                  {ROLE_LABELS[role] || role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <FragmentRows key={group} group={group}>
                {CRM_MODULES.filter((m) => m.group === group).map((module) => (
                  <tr key={module.key} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium text-gray-800">{module.label}</td>
                    {roles.map((role) => {
                      const eligible = (module.eligibleRoles as string[]).includes(role)
                      const cell = `${role}:${modulePermissionKey(module.key)}`
                      const checked = grantedSet.has(cell)
                      return (
                        <td key={role} className="px-2 py-2 text-center">
                          {eligible ? (
                            <input
                              type="checkbox"
                              aria-label={`${ROLE_LABELS[role] || role} can open ${module.label}`}
                              checked={checked}
                              disabled={!ready || pendingCell === cell}
                              onChange={() => toggle(role, module.key)}
                              className="h-4 w-4 accent-[#9C7A33]"
                            />
                          ) : (
                            <span className="text-gray-300" title="Not available for this role">
                              —
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FragmentRows({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={99} className="pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
          {group}
        </td>
      </tr>
      {children}
    </>
  )
}
