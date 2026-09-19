'use client'

import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { inviteTeamMember, resendTeamMemberInvite, setTeamMemberActive } from './actions'

type Member = {
  id: string
  full_name: string | null
  email: string
  role: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
}

export function TeamManager({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [rowPending, setRowPending] = useState<string | null>(null)

  const onInvite = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!fullName.trim() || !email.trim()) {
      setError('Name and email are required')
      return
    }
    const formData = new FormData()
    formData.set('full_name', fullName.trim())
    formData.set('email', email.trim())
    startTransition(async () => {
      const result = await inviteTeamMember(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setNotice(`Invited ${email.trim()}. They'll receive a temporary password by email.`)
      setFullName('')
      setEmail('')
    })
  }

  const onResend = (userId: string, memberEmail: string) => {
    setError(null)
    setNotice(null)
    setRowPending(userId)
    const formData = new FormData()
    formData.set('user_id', userId)
    startTransition(async () => {
      const result = await resendTeamMemberInvite(formData)
      setRowPending(null)
      if (result.error) {
        setError(result.error)
        return
      }
      setNotice(`Sent a new temporary password to ${memberEmail}.`)
    })
  }

  const onToggleActive = (userId: string, nextActive: boolean) => {
    setError(null)
    setNotice(null)
    setRowPending(userId)
    const formData = new FormData()
    formData.set('user_id', userId)
    formData.set('is_active', nextActive ? '1' : '0')
    startTransition(async () => {
      const result = await setTeamMemberActive(formData)
      setRowPending(null)
      if (result.error) {
        setError(result.error)
        return
      }
      setNotice(nextActive ? 'Team member reactivated.' : 'Team member deactivated.')
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onInvite} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#0D1B2A]">Invite a team member</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Name"
            className="rounded-xl border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2.5 text-xs text-[#0D1B2A] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#9C7A33] focus:border-[#9C7A33]"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="rounded-xl border border-[#E2E8F0] bg-[#F5F7FA] px-3 py-2.5 text-xs text-[#0D1B2A] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#9C7A33] focus:border-[#9C7A33]"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#9C7A33] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
        {notice && <p className="mt-3 text-xs text-green-700">{notice}</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F5F7FA] text-[#64748B]">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-[#E2E8F0]">
                <td className="px-4 py-3 text-[#0D1B2A]">{member.full_name || '—'}</td>
                <td className="px-4 py-3 text-[#0D1B2A]">{member.email}</td>
                <td className="px-4 py-3 text-[#64748B]">{member.role === 'client_admin' ? 'Admin' : 'Member'}</td>
                <td className="px-4 py-3">
                  {!member.is_active ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">Deactivated</span>
                  ) : member.must_change_password ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">Invited</span>
                  ) : (
                    <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {member.id === currentUserId ? (
                    <span className="text-[#94A3B8]">You</span>
                  ) : member.role === 'client_admin' ? (
                    <span className="text-[#94A3B8]">—</span>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={rowPending === member.id}
                        onClick={() => onResend(member.id, member.email)}
                        className="font-semibold text-[#9C7A33] hover:underline disabled:opacity-50"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        disabled={rowPending === member.id}
                        onClick={() => onToggleActive(member.id, !member.is_active)}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {member.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#94A3B8]">No team members yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
