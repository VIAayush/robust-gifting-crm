import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TeamManager } from './team-manager'

export default async function TeamPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'client_admin') redirect('/portal')
  if (!profile.company_id) {
    return (
      <div>
        <h1 className="font-serif text-2xl text-[#0D1B2A]">Team</h1>
        <p className="mt-2 text-sm text-[#64748B]">Your account is not linked to a company yet.</p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active, must_change_password, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A]">Team</h1>
      <p className="mt-1 text-sm text-[#64748B]">Invite people at your company to your Robust Gifting portal.</p>
      <div className="mt-6">
        <TeamManager members={members || []} currentUserId={profile.id} />
      </div>
    </div>
  )
}
