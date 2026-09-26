import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchNotifications } from '@/lib/notifications'

/**
 * Retries anything still pending in notification_outbox (e.g. after a
 * transient WhatsApp API error). Point a scheduler (Vercel Cron, etc.) at it
 * with header `Authorization: Bearer <CRON_SECRET>`. Disabled unless
 * CRON_SECRET is set, so it can never be triggered anonymously.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 404 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  const summary = await dispatchNotifications(admin)
  return NextResponse.json(summary)
}
