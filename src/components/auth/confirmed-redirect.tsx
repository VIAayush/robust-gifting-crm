'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'

const REDIRECT_MS = 2200

const COPY: Record<string, { title: string; message: string; destination: string }> = {
  signup: {
    title: 'Email confirmed',
    message: 'Your email address has been confirmed.',
    destination: '/login?confirmed=1',
  },
  recovery: {
    title: 'Password updated',
    message: 'Your password has been updated.',
    destination: '/login?reset=success',
  },
}

/** Shown right after a signup-confirmation or password-reset link succeeds, before handing off to sign-in. */
export function ConfirmedRedirect({ flow }: { flow: string }) {
  const router = useRouter()
  const copy = COPY[flow] || { title: 'All set', message: 'You can now sign in.', destination: '/login' }

  useEffect(() => {
    const timer = window.setTimeout(() => router.replace(copy.destination), REDIRECT_MS)
    return () => window.clearTimeout(timer)
  }, [copy.destination, router])

  return (
    <AuthShell title={copy.title}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
        <p className="text-sm text-[#4A5568]">{copy.message}</p>
        <p className="text-xs text-[#94A3B8]">Taking you to sign in…</p>
      </div>
    </AuthShell>
  )
}
