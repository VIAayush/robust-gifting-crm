import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { formatDateTime } from '@/lib/utils'
import { ORDER_LIFECYCLE, ORDER_STATUS_LABELS } from '@/lib/order-workflow'
import Link from 'next/link'
import { BrandName } from '@/components/brand/brand-name'

export default async function KnowledgePage() {
  const profile = await requireStaff()
  const supabase = await createClient()
  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(12)

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-[#0D1B2A]">Knowledge Center</h1>
        <p className="mt-1 text-xs text-[#4A5568]">
          How <BrandName /> runs a gift programme — from enquiry to payment.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <h2 className="font-serif text-lg text-[#0D1B2A]">Order workflow</h2>
        <ol className="space-y-2 text-sm">
          {ORDER_LIFECYCLE.map((st, i) => (
            <li key={st} className="flex gap-3">
              <span className="w-6 font-mono text-[11px] text-[#4A5568]">{i + 1}</span>
              <span>{ORDER_STATUS_LABELS[st]}</span>
            </li>
          ))}
        </ol>
        {(profile.role === 'admin' || profile.role === 'operations') && (
          <Link
            href="/crm/order-management"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7C6224] hover:text-white sm:w-auto"
          >
            Open order management
          </Link>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <h2 className="font-serif text-lg text-[#0D1B2A]">Company announcements</h2>
        {(announcements || []).map((a) => (
          <article key={a.id} className="border-b border-[#E7ECF3] pb-3 last:border-b-0 last:pb-0">
            <p className="text-sm font-semibold text-[#0D1B2A]">{a.title}</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-[#4A5568]">{a.body}</p>
            <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(a.created_at)}</p>
          </article>
        ))}
        {(!announcements || announcements.length === 0) && (
          <p className="text-sm text-gray-500">No announcements yet.</p>
        )}
        <Link
          href="/crm/announcements"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[#9C7A33] bg-white px-4 py-2 text-xs font-semibold text-[#9C7A33] transition-colors hover:bg-[#F1F4F9] sm:w-auto"
        >
          All announcements
        </Link>
      </section>
    </div>
  )
}
