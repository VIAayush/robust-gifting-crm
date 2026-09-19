import { redirect } from 'next/navigation'
import { isSafeNext } from '@/lib/safe-next'
import { LoginForm } from './login-form'
import { confirmSearchFromParams, hasRecoveryQuery } from '@/lib/auth/recovery'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; confirmed?: string; error?: string; code?: string; type?: string; token_hash?: string }>
}) {
  const { next = '', reset = '', confirmed = '', error = '', code = '', type = '', token_hash = '' } = await searchParams
  const query = new URLSearchParams()
  if (code) query.set('code', code)
  if (token_hash) query.set('token_hash', token_hash)
  if (type) query.set('type', type)
  if (hasRecoveryQuery(query)) {
    redirect(`/auth/confirm?${confirmSearchFromParams({ code, type, token_hash })}`)
  }
  return (
    <LoginForm
      next={isSafeNext(next) ? next : ''}
      resetSuccess={reset === 'success'}
      confirmedSuccess={confirmed === '1'}
      linkError={error === 'invalid-link' ? 'That confirmation link is invalid or has expired. Please sign up again.' : ''}
    />
  )
}
