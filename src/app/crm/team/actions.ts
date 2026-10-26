'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { recoveryRedirectTo } from '@/lib/auth/request-origin'
import { sendEmail } from '@/lib/email/resend'
import { teamInviteEmail } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'

export async function updateTeamMember(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return { error: 'Admin only' }

  const id = String(formData.get('id') || '')
  const role = String(formData.get('role') || '')
  const isActive = String(formData.get('is_active') || '') === 'true'
  const departmentId = String(formData.get('department_id') || '') || null
  if (!id) return { error: 'Member required' }
  // Only internal roles can be assigned here - a staff record must never be turned into a client login from this screen.
  if (!['admin', 'sales', 'operations', 'accounts', 'management'].includes(role)) return { error: 'Invalid role' }
  if (id === user.id && (role !== 'admin' || !isActive)) return { error: 'You cannot remove your own admin access' }

  const update: Record<string, unknown> = { role, is_active: isActive, department_id: departmentId }
  if (formData.has('phone')) {
    const phone = String(formData.get('phone') || '').trim()
    if (phone && phone.replace(/\D/g, '').length < 10) return { error: 'Phone number looks too short' }
    update.phone = phone || null
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm/team')
  return { success: true }
}

const STAFF_ROLES = ['admin', 'sales', 'operations', 'accounts', 'management'] as const
const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  sales: 'Sales',
  operations: 'Operations / Procurement',
  accounts: 'Accounts / Finance',
  management: 'Management',
}

type InviteResult = { error?: string; success?: boolean; message?: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' } as const
  const { data: me } = await supabase.from('profiles').select('role, full_name, is_active').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin' || !me.is_active) return { error: 'Only an admin can invite team members.' } as const
  return { supabase, user, me } as const
}

async function sendInvite(email: string, name: string, role: string, invitedBy: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Invites are not configured on this server.' }
  // A recovery link lands on the existing /reset-password screen, which is
  // exactly "choose your password" for a brand-new account with none set.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: await recoveryRedirectTo() },
  })
  const link = data?.properties?.action_link
  if (error || !link) {
    console.error('[team] invite link failed', error?.message)
    return { ok: false, error: 'Could not create the set-password link.' }
  }
  const { subject, html } = teamInviteEmail({
    setPasswordUrl: link,
    name: name || email,
    roleLabel: STAFF_ROLE_LABELS[role] || role,
    invitedBy: invitedBy || 'Your admin',
  })
  const sent = await sendEmail({ to: email, subject, html })
  if (!sent.ok) return { ok: false, error: sent.error }
  return { ok: true }
}

/** CRM > Team "Invite user": creates a staff login (no password) and emails a set-password link. */
export async function inviteTeamMember(formData: FormData): Promise<InviteResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const fullName = String(formData.get('full_name') || '').trim().replace(/\s+/g, ' ')
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const role = String(formData.get('role') || '')
  const departmentId = String(formData.get('department_id') || '') || null

  if (fullName.length < 2) return { error: 'Enter the person’s full name.' }
  if (fullName.length > 80) return { error: 'Keep the name under 80 characters.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter a valid email address.' }
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return { error: 'Choose a role.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Invites are not configured on this server.' }

  if (departmentId) {
    const { data: dept } = await admin.from('departments').select('id').eq('id', departmentId).maybeSingle()
    if (!dept) return { error: 'That department no longer exists.' }
  }

  const { data: existing } = await admin.from('profiles').select('id, role').ilike('email', email).limit(1)
  if (existing && existing.length > 0) {
    return { error: 'Someone with this email already has an account. Change their role in the table below instead.' }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (createError || !created?.user) {
    const message = (createError?.message || '').toLowerCase()
    if (message.includes('already')) return { error: 'Someone with this email already has an account.' }
    console.error('[team] create user failed', createError?.message)
    return { error: 'Could not create the account. Please try again.' }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ full_name: fullName, role, department_id: departmentId, is_active: true, company_id: null })
    .eq('id', created.user.id)
  if (profileError) {
    console.error('[team] profile update failed', profileError.message)
    return { error: 'The account was created but its role could not be saved. Set the role in the table below.' }
  }

  await writeAudit(ctx.supabase, {
    action: 'invite_user',
    entity: 'profiles',
    entityId: created.user.id,
    next: { email, role, department_id: departmentId },
    userId: ctx.user.id,
  })

  const sent = await sendInvite(email, fullName, role, ctx.me?.full_name || 'Your admin')
  revalidatePath('/crm/team')
  if (!sent.ok) {
    return {
      error: `${fullName} was added, but the invite email could not be sent (${sent.error}). Use "Resend invite" next to their name once email is working.`,
    }
  }
  return { success: true, message: `Invite sent to ${email}. They can set their password from the link in the email.` }
}

export async function resendTeamInvite(formData: FormData): Promise<InviteResult> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const id = String(formData.get('id') || '')
  const admin = createAdminClient()
  if (!admin) return { error: 'Invites are not configured on this server.' }
  const { data: profile } = await admin.from('profiles').select('email, full_name, role, is_active').eq('id', id).maybeSingle()
  if (!profile?.email) return { error: 'Team member not found.' }
  if (!(STAFF_ROLES as readonly string[]).includes(profile.role)) return { error: 'Only staff members can be invited here.' }
  if (!profile.is_active) return { error: 'Reactivate this member before resending the invite.' }
  const sent = await sendInvite(profile.email, profile.full_name || profile.email, profile.role, ctx.me?.full_name || 'Your admin')
  if (!sent.ok) return { error: `The invite email could not be sent (${sent.error}).` }
  await writeAudit(ctx.supabase, { action: 'resend_invite', entity: 'profiles', entityId: id, userId: ctx.user.id })
  return { success: true, message: `Invite re-sent to ${profile.email}.` }
}
