'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recoveryRedirectTo } from '@/lib/auth/request-origin'
import { sendEmail } from '@/lib/email/resend'
import { teamInviteEmail } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'
import { emailAllowed } from '@/lib/companies/email-domains'
import { exactIlike } from '@/lib/security/like'

type Result = { success: true; message?: string } | { error: string }

/**
 * Everything here runs only for an active CLIENT ADMIN, and only ever touches profiles of that admin's own
 * company. The company comes from the database (client_company_id), never from the browser, and new
 * members are always created as plain client users: a client admin cannot create another admin, a staff
 * login, or touch another company's people.
 */
async function clientAdminContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' } as const
  const { data: profile } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle()
  if (!profile || !profile.is_active || profile.role !== 'client_admin') {
    return { ok: false, error: 'Only your company administrator can manage team members.' } as const
  }
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { ok: false, error: 'Your account is not linked to a company yet.' } as const
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Team management is not available right now.' } as const
  return { ok: true, userId: user.id, name: profile.full_name as string | null, companyId: companyId as string, supabase, admin } as const
}

export async function inviteCompanyMember(formData: FormData): Promise<Result> {
  const ctx = await clientAdminContext()
  if (!ctx.ok) return { error: ctx.error }

  const fullName = String(formData.get('full_name') || '').trim().replace(/\s+/g, ' ')
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (fullName.length < 2) return { error: 'Enter the person’s full name.' }
  if (fullName.length > 80) return { error: 'Keep the name under 80 characters.' }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter a valid email address.' }

  // Company email-domain rule (empty list = no restriction). Tolerates the column not existing yet.
  const { data: domainRow, error: domainError } = await ctx.admin.from('companies').select('allowed_email_domains').eq('id', ctx.companyId).maybeSingle()
  const allowed = domainError ? [] : ((domainRow?.allowed_email_domains as string[] | null) ?? [])
  if (!emailAllowed(email, allowed)) return { error: `Your company only allows email addresses from: ${allowed.join(', ')}.` }

  const { data: existing } = await ctx.admin.from('profiles').select('id').ilike('email', exactIlike(email)).limit(1)
  if (existing && existing.length > 0) return { error: 'Someone with this email already has an account. Contact Robust Gifting if they need access.' }

  const { data: created, error: createError } = await ctx.admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'client_user', company_id: ctx.companyId },
  })
  if (createError || !created?.user) {
    if ((createError?.message || '').toLowerCase().includes('already')) return { error: 'Someone with this email already has an account.' }
    console.error('[portal-team] create user failed', createError?.message)
    return { error: 'Could not create the account. Please try again.' }
  }

  // Role and company are forced here, whatever the sign-up trigger copied from metadata.
  const { error: profileError } = await ctx.admin
    .from('profiles')
    .update({ full_name: fullName, role: 'client_user', company_id: ctx.companyId, is_active: true })
    .eq('id', created.user.id)
  if (profileError) {
    console.error('[portal-team] profile update failed', profileError.message)
    await ctx.admin.auth.admin.deleteUser(created.user.id)
    return { error: 'The account could not be linked to your company, so nothing was created. Please try again.' }
  }

  const { data: link, error: linkError } = await ctx.admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: await recoveryRedirectTo() } })
  const actionLink = link?.properties?.action_link
  let message = 'Invitation sent.'
  if (linkError || !actionLink) {
    message = 'The account was created, but the invitation email could not be prepared. Ask Robust Gifting to resend it.'
  } else {
    const mail = teamInviteEmail({ setPasswordUrl: actionLink, name: fullName, roleLabel: 'Client team member', invitedBy: ctx.name || 'Your company administrator' })
    const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html })
    if (!sent.ok) message = 'The account was created, but the invitation email could not be sent. Ask Robust Gifting to resend it.'
  }

  await writeAudit(ctx.admin, { action: 'client_invite_member', entity: 'profiles', entityId: created.user.id, next: { company_id: ctx.companyId, role: 'client_user', invited_by: ctx.userId }, userId: ctx.userId })
  revalidatePath('/portal/team')
  return { success: true, message }
}

export async function setCompanyMemberActive(memberId: string, active: boolean): Promise<Result> {
  const ctx = await clientAdminContext()
  if (!ctx.ok) return { error: ctx.error }
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return { error: 'Member not found.' }
  if (memberId === ctx.userId) return { error: 'You cannot deactivate your own account.' }

  const { data: member } = await ctx.admin.from('profiles').select('id, role, company_id').eq('id', memberId).maybeSingle()
  // Same company only, and only client logins: never a staff profile, never another company's user.
  if (!member || member.company_id !== ctx.companyId || (member.role !== 'client_user' && member.role !== 'client_admin')) {
    return { error: 'Member not found.' }
  }
  if (member.role === 'client_admin') return { error: 'Administrators are managed by Robust Gifting.' }

  const { error } = await ctx.admin.from('profiles').update({ is_active: active }).eq('id', memberId).eq('company_id', ctx.companyId)
  if (error) return { error: 'We could not update this member. Please try again.' }
  await writeAudit(ctx.admin, { action: active ? 'client_activate_member' : 'client_deactivate_member', entity: 'profiles', entityId: memberId, next: { is_active: active }, userId: ctx.userId })
  revalidatePath('/portal/team')
  return { success: true }
}
