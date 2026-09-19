'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { completeForcedPasswordChange } from '@/app/login/actions'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordField } from '@/components/auth/password-field'

export function SetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const formData = new FormData()
    formData.set('password', password)
    formData.set('confirm_password', confirm)
    const result = await completeForcedPasswordChange(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.push('/portal')
    router.refresh()
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle="You signed in with a temporary password. Choose your own before continuing."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">New password</label>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Confirm password</label>
          <PasswordField name="confirm_password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} placeholder="Re-enter password" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-xs font-semibold text-white bg-[#9C7A33] hover:bg-[#7C6224] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set password'}
        </button>
      </form>
    </AuthShell>
  )
}
