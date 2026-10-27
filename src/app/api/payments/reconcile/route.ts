import { NextResponse } from 'next/server'
import { bearerMatches } from '@/lib/security/secret'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPaymentReconciliation } from '@/lib/payments/reconcile-run'

/**
 * Reconciles payments stuck in pending/processing and paid payments whose order was never created.
 * Point a scheduler (Vercel Cron, etc.) at it every 10-15 minutes with header `Authorization: Bearer <CRON_SECRET>`.
 * Disabled unless CRON_SECRET is set, so it can never be triggered anonymously. Safe to call repeatedly.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 404 })
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  try {
    return NextResponse.json(await runPaymentReconciliation(admin))
  } catch (error) {
    console.error('[reconcile] run failed', (error as Error).message)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
