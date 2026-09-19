import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { landingPathForRole } from '@/lib/safe-next'
import { SetPasswordForm } from './set-password-form'

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, must_change_password')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/login')
  if (!profile.must_change_password) redirect(landingPathForRole(profile.role))

  return <SetPasswordForm />
}
