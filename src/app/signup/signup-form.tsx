'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, User } from 'lucide-react'
import { signUp } from '@/app/login/actions'
import { AuthShell } from '@/components/auth/auth-shell'
import { BrandName } from '@/components/brand/brand-name'
import { PasswordField } from '@/components/auth/password-field'
import { getTabId } from '@/lib/supabase/client'
import { TAB_QUERY } from '@/lib/auth/tab'

export function SignupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError('All fields are required')
      return
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address')
      return
    }
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
    formData.set('full_name', name.trim())
    formData.set('email', email.trim())
    formData.set('password', password)
    formData.set('confirm_password', confirm)
    const result = await signUp(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.redirectTo) {
      // Carry this tab's own id explicitly — see the matching comment in
      // login-form.tsx for why a bare router.push() isn't reliable here.
      const dest = new URL(result.redirectTo, window.location.origin)
      dest.searchParams.set(TAB_QUERY, getTabId())
      router.push(`${dest.pathname}${dest.search}`)
      router.refresh()
      return
    }
    setMessage(result.message || 'Account created.')
    setLoading(false)
  }

  return (
    <AuthShell
      title={
        <>
          Create a <BrandName /> account
        </>
      }
      subtitle="Public signup creates a client portal login. Staff roles are assigned by an admin."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">{error}</div>
        )}
        {message && (
          <div className="p-3 bg-green-50 text-green-800 text-xs rounded-xl border border-green-200">{message}</div>
        )}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Name</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <User className="h-4 w-4 text-gray-400" />
            </div>
            <input
              name="full_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="block w-full pl-10 pr-3 py-2.5 bg-[#F5F7FA] border border-[#E2E8F0] rounded-xl text-xs text-[#0D1B2A] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#9C7A33] focus:border-[#9C7A33]"
              placeholder="Your name"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Email</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail className="h-4 w-4 text-gray-400" />
            </div>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="block w-full pl-10 pr-3 py-2.5 bg-[#F5F7FA] border border-[#E2E8F0] rounded-xl text-xs text-[#0D1B2A] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#9C7A33] focus:border-[#9C7A33]"
              placeholder="you@company.com"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">Password</label>
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
        </button>
      </form>
      <p className="text-xs text-center text-[#4A5568] mt-5">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[#9C7A33] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
