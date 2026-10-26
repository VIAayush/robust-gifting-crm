import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { getAllowedModules } from '@/lib/module-access'
import { CRM_MODULES, moduleByKey } from '@/lib/modules'

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const { module } = await searchParams
  const { modules } = await getAllowedModules()
  const blocked = module ? moduleByKey(module) : null
  const firstAllowed = CRM_MODULES.find((m) => modules.has(m.key))

  return (
    <div>
      <div className="max-w-lg rounded-lg border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#FEE2E2] text-[#991B1B]">
            <ShieldOff size={16} />
          </span>
          <div>
            <h1 className="text-base font-semibold text-[#0D1B2A]">Access denied</h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Your role does not include {blocked ? <strong>{blocked.label}</strong> : 'this section'}. Ask an admin to enable it in
              Settings &gt; Role Permissions if you need it.
            </p>
            {firstAllowed ? (
              <Link
                href={firstAllowed.prefixes[0]}
                className="mt-4 inline-flex rounded-md bg-[#9C7A33] px-3 py-1.5 text-sm font-medium text-[#F5F7FA] hover:bg-[#7C6224] hover:text-[#F5F7FA]"
              >
                Go to {firstAllowed.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
