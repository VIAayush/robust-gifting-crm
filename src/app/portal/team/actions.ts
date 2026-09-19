'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTemporaryPassword, SERVICE_ROLE_MISSING, validateNewPassword } from '@/lib/auth/password'
import { requestOrigin } from '@/lib/auth/request-origin'
import { sendEmail } from '@/lib/email/resend'
import { teamInviteEmail } from '@/lib/email/templates'

async function requireCompanyAdmin() {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' as const }
  if (profile.role !== 'client_admin') return { error: 'Only a company admin can manage the team' as const }
  if (!profile.company_id) return { error: 'Your account is not linked to a company yet' as const }
  return { profile }
}

export async function inviteTeamMember(formData: FormData) {
  const access = await requireCompanyAdmin()
  if ('error' in access) return { error: access.error }
  const { profile } = access

  const fullName = String(formData.get('full_name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!fullName) return { error: 'Name is required' }
  if (!email || !email.includes('@')) return { error: 'A valid email is required' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVICE_ROLE_MISSING }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existingProfile) return { error: 'A user with this email already exists.' }

  const { data: company } = await admin.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
  if (!company) return { error: 'Your company could not be found.' }

  const password = generateTemporaryPassword()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'client_user', company_id: profile.company_id },
  })
  if (createError || !created?.user) {
    const message = createError?.message || 'Could not create the login'
    if (message.toLowerCase().includes('already') || message.toLowerCase().includes('registered')) {
      return { error: 'A user with this email already exists.' }
    }
    return { error: message }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: created.user.id,
      full_name: fullName,
      email,
      role: 'client_user',
      company_id: profile.company_id,
      is_active: true,
      must_change_password: true,
    })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: `Team member was not added: ${profileError.message}` }
  }

  const origin = await requestOrigin()
  const sent = await sendEmail({
    to: email,
    ...teamInviteEmail({
      companyName: company.name,
      tempPassword: password,
      email,
      loginUrl: `${origin}/login`,
    }),
  })
  if (!sent.ok) {
    console.error('[team] failed to send invite email:', sent.error)
    await admin.from('profiles').delete().eq('id', created.user.id)
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: 'Could not send the invite email right now. Please try again in a few minutes.' }
  }

  revalidatePath('/portal/team')
  return { success: true as const }
}

export async function resendTeamMemberInvite(formData: FormData) {
  const access = await requireCompanyAdmin()
  if ('error' in access) return { error: access.error }
  const { profile } = access

  const userId = String(formData.get('user_id') || '')
  if (!userId) return { error: 'Team member is required' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVICE_ROLE_MISSING }

  const { data: member } = await admin
    .from('profiles')
    .select('id, email, full_name, company_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!member || member.company_id !== profile.company_id) return { error: 'Team member not found' }
  if (member.role !== 'client_user') return { error: 'Only regular team members can be re-invited here' }

  const { data: company } = await admin.from('companies').select('name').eq('id', profile.company_id).maybeSingle()
  if (!company) return { error: 'Your company could not be found.' }

  const password = generateTemporaryPassword()
  const passwordError = validateNewPassword(password)
  if (passwordError) return { error: passwordError }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password })
  if (updateError) return { error: updateError.message }

  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)

  const origin = await requestOrigin()
  const sent = await sendEmail({
    to: member.email,
    ...teamInviteEmail({
      companyName: company.name,
      tempPassword: password,
      email: member.email,
      loginUrl: `${origin}/login`,
    }),
  })
  if (!sent.ok) {
    console.error('[team] failed to send re-invite email:', sent.error)
    return { error: 'Could not send the email right now. Please try again in a few minutes.' }
  }

  revalidatePath('/portal/team')
  return { success: true as const }
}

export async function setTeamMemberActive(formData: FormData) {
  const access = await requireCompanyAdmin()
  if ('error' in access) return { error: access.error }
  const { profile } = access

  const userId = String(formData.get('user_id') || '')
  const isActive = formData.get('is_active') === '1'
  if (!userId) return { error: 'Team member is required' }
  if (userId === profile.id) return { error: 'You cannot deactivate your own account' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVICE_ROLE_MISSING }

  const { data: member } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!member || member.company_id !== profile.company_id) return { error: 'Team member not found' }
  if (member.role !== 'client_user') return { error: 'Only regular team members can be managed here' }

  const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/portal/team')
  return { success: true as const }
}
