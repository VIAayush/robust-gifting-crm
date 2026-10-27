'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteCompanyMember, setCompanyMemberActive } from './actions'

export type Member = { id: string; name: string; email: string; role: string; active: boolean; isYou: boolean }

const field = 'mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#9C7A33] focus:outline-none'

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function invite(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setMessage(null)
    const data = new FormData()
    data.set('full_name', name)
    data.set('email', email)
    startTransition(async () => {
      try {
        const res = await inviteCompanyMember(data)
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else {
          setMessage({ kind: 'ok', text: res.message || 'Invitation sent.' })
          setName('')
          setEmail('')
          router.refresh()
        }
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }

  function toggle(member: Member) {
    if (pending) return
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await setCompanyMemberActive(member.id, !member.active)
        if ('error' in res) setMessage({ kind: 'error', text: res.error })
        else router.refresh()
      } catch {
        setMessage({ kind: 'error', text: 'Something went wrong. Please try again.' })
      }
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4" noValidate>
        <h2 className="font-serif text-lg">Invite a team member</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">Full name<input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" /></label>
          <label className="block text-sm font-medium text-gray-700">Email address<input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" /></label>
        </div>
        {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p> : null}
        <button disabled={pending} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60 sm:w-auto">{pending ? 'Working…' : 'Send invitation'}</button>
      </form>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="mb-3 font-serif text-lg">Members</h2>
        <ul className="divide-y divide-[#E7ECF3]">
          {members.map((member) => (
            <li key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {member.name || member.email}
                  {member.isYou ? <span className="ml-2 text-xs font-normal text-gray-400">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {member.email} · {member.role === 'client_admin' ? 'Administrator' : 'Team member'} · {member.active ? 'Active' : 'Switched off'}
                </p>
              </div>
              {member.role === 'client_user' && !member.isYou ? (
                <button type="button" disabled={pending} onClick={() => toggle(member)} className="min-h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-[#F5F7FA] disabled:opacity-60">
                  {member.active ? 'Switch off access' : 'Switch on access'}
                </button>
              ) : null}
            </li>
          ))}
          {members.length === 0 ? <li className="py-3 text-sm text-gray-500">No members yet.</li> : null}
        </ul>
      </div>
    </div>
  )
}
