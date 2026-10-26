'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { inviteTeamMember, resendTeamInvite, updateTeamMember } from '@/app/crm/team/actions'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  department_id: string | null
  is_active: boolean | null
  created_at: string
  phone?: string | null
}

type Department = { id: string; name: string }

// Existing roles already cover the job functions: operations = procurement &
// fulfilment, accounts = finance, management = oversight/reporting. Exact
// module access per role is configured in Settings > Role Permissions.
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  sales: 'Sales',
  operations: 'Operations / Procurement',
  accounts: 'Accounts / Finance',
  management: 'Management',
}

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  management: 'bg-blue-100 text-blue-800',
  sales: 'bg-green-100 text-green-800',
  operations: 'bg-amber-100 text-amber-800',
  accounts: 'bg-indigo-100 text-indigo-800',
}

const control = 'min-h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs'
// One template for the header and every row, so each control sits under its heading.
const GRID = 'grid grid-cols-[minmax(11rem,1.4fr)_minmax(8rem,1fr)_minmax(7.5rem,0.9fr)_minmax(8rem,1fr)_6.5rem_6rem_7.5rem] items-center gap-3'

function RoleSelect({ name = 'role', defaultValue }: { name?: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} aria-label="Role" className={control}>
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}

function DepartmentSelect({ departments, defaultValue }: { departments: Department[]; defaultValue?: string }) {
  return (
    <select name="department_id" defaultValue={defaultValue || ''} aria-label="Department" className={control}>
      <option value="">No department</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  )
}

function InvitePanel({ departments, onClose }: { departments: Department[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const form = event.currentTarget
        const formData = new FormData(form)
        setResult(null)
        startTransition(async () => {
          const res = await inviteTeamMember(formData)
          if (res.error) {
            setResult({ ok: false, text: res.error })
            router.refresh()
            return
          }
          setResult({ ok: true, text: res.message || 'Invite sent.' })
          form.reset()
          router.refresh()
        })
      }}
      className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Invite a team member</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-gray-500">
        They get an email with a link to set their own password. Nobody, including you, ever sees or types their password.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-gray-600">
          Full name
          <input name="full_name" required maxLength={80} autoComplete="off" className={`${control} mt-1`} />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Email
          <input name="email" type="email" required maxLength={120} autoComplete="off" className={`${control} mt-1`} />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Role
          <div className="mt-1">
            <RoleSelect defaultValue="sales" />
          </div>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Department
          <div className="mt-1">
            <DepartmentSelect departments={departments} />
          </div>
        </label>
      </div>
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-xs ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {result.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#9C7A33] px-4 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
      >
        <UserPlus size={14} /> {pending ? 'Sending invite…' : 'Send invite'}
      </button>
    </form>
  )
}

function MemberRow({ member, departments, mobile }: { member: Profile; departments: Department[]; mobile?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const formData = new FormData(event.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const res = await updateTeamMember(formData)
      if (res && 'error' in res && res.error) setMessage({ ok: false, text: res.error })
      else {
        setMessage({ ok: true, text: 'Saved' })
        router.refresh()
      }
    })
  }

  const resend = () => {
    const formData = new FormData()
    formData.set('id', member.id)
    setMessage(null)
    startTransition(async () => {
      const res = await resendTeamInvite(formData)
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: res.message || 'Invite re-sent' })
    })
  }

  const feedback = message ? (
    <p role={message.ok ? 'status' : 'alert'} className={`text-[11px] ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
      {message.text}
    </p>
  ) : null

  const fields = (
    <>
      <RoleSelect defaultValue={member.role} />
      <input
        name="phone"
        type="tel"
        aria-label={`WhatsApp number for ${member.full_name || 'team member'}`}
        defaultValue={member.phone || ''}
        placeholder="WhatsApp no."
        className={control}
      />
      <DepartmentSelect departments={departments} defaultValue={member.department_id || ''} />
      <select name="is_active" defaultValue={member.is_active === false ? 'false' : 'true'} aria-label="Status" className={control}>
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
    </>
  )

  if (mobile) {
    return (
      <article className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-[#0D1B2A]">{member.full_name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{member.email}</p>
          <span className={`mt-2 inline-block rounded px-2 py-1 text-[11px] font-medium ${roleColors[member.role] || 'bg-gray-100'}`}>
            {ROLE_LABELS[member.role] || member.role}
          </span>
        </div>
        <form onSubmit={save} className="grid gap-2 border-t border-[#E7ECF3] pt-3">
          <input type="hidden" name="id" value={member.id} />
          {fields}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-[#9C7A33] px-3 text-xs font-semibold text-white disabled:opacity-60">
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={resend} disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-[#9C7A33]">
              Resend invite
            </button>
          </div>
          {feedback}
          <p className="text-[11px] text-gray-400">Joined {formatDate(member.created_at)}</p>
        </form>
      </article>
    )
  }

  return (
    <form onSubmit={save} className={`${GRID} border-b px-3 py-3 text-xs last:border-b-0`}>
      <input type="hidden" name="id" value={member.id} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{member.full_name}</p>
        <p className="truncate text-gray-500">{member.email}</p>
      </div>
      {fields}
      <span className="text-gray-500">{formatDate(member.created_at)}</span>
      <div className="space-y-1">
        <button type="submit" disabled={pending} className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-3 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={resend} disabled={pending} className="w-full text-center text-[11px] font-medium text-[#9C7A33] hover:underline">
          Resend invite
        </button>
        {feedback}
      </div>
    </form>
  )
}

export function TeamDirectory({ profiles, departments }: { profiles: Profile[]; departments: Department[] }) {
  const [inviting, setInviting] = useState(false)
  const staff = profiles.filter((p) => p.role !== 'client_admin' && p.role !== 'client_user')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Team Directory</h1>
        {!inviting ? (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]"
          >
            <UserPlus size={16} /> Invite user
          </button>
        ) : null}
      </div>

      {inviting ? <InvitePanel departments={departments} onClose={() => setInviting(false)} /> : null}

      <div className="space-y-4 md:hidden">
        {staff.map((p) => (
          <MemberRow key={p.id} member={p} departments={departments} mobile />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border bg-white md:block">
        <div className="min-w-[960px]">
          <div className={`${GRID} border-b bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-500`}>
            <span>Name / Email</span>
            <span>Role</span>
            <span>WhatsApp no.</span>
            <span>Department</span>
            <span>Status</span>
            <span>Joined</span>
            <span />
          </div>
          {staff.map((p) => (
            <MemberRow key={p.id} member={p} departments={departments} />
          ))}
        </div>
      </div>
    </div>
  )
}
