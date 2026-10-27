import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TeamManager, type Member } from './team-manager'

export const metadata = { title: 'My team' }

export default async function PortalTeamPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle()
  if (!profile?.is_active || profile.role !== 'client_admin') {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        Team management is available to your company administrator. Please ask them to add or remove team members.
      </div>
    )
  }

  const { data: companyId } = await supabase.rpc('client_company_id')
  const admin = createAdminClient()
  let members: Member[] = []
  if (companyId && admin) {
    // Server-side and scoped to this company only; no other company's users can appear here.
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('company_id', companyId)
      .in('role', ['client_admin', 'client_user'])
      .order('full_name')
    members = (data || []).map((m) => ({ id: m.id as string, name: (m.full_name as string) || '', email: m.email as string, role: m.role as string, active: Boolean(m.is_active), isYou: m.id === user.id }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My team</h1>
        <p className="mt-1 text-sm text-gray-500">Invite colleagues to your company&apos;s portal and switch off access when someone leaves. Team members see the same catalogues, requirements and quotations as you.</p>
      </div>
      <TeamManager members={members} />
    </div>
  )
}
