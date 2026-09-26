import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { updateOrgSettings } from './actions'
import { asFormAction } from '@/lib/form-action'
import { getActiveProviderName } from '@/lib/payments'
import { isWhatsAppConfigured } from '@/lib/notifications'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          <h2 className="font-bold mb-1">Access Denied</h2>
          <p className="text-sm">You must be an administrator to view this page.</p>
        </div>
      </div>
    )
  }

  const { data: settings } = await supabase.from('org_settings').select('*').limit(1).maybeSingle()
  const paymentProvider = getActiveProviderName()
  const whatsappReady = isWhatsAppConfigured()
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--color-primary)] mb-6">Organization Settings</h1>
      <form action={asFormAction(updateOrgSettings)} className="bg-white p-6 rounded-lg border space-y-4 text-sm">
        <label className="block">
          <span className="text-gray-500 text-xs">Organisation name</span>
          <input name="organisation_name" defaultValue={settings?.organisation_name || 'Robust Gifting'} className="w-full border rounded-lg px-3 py-2 mt-1" />
        </label>
        <label className="block">
          <span className="text-gray-500 text-xs">Default tax percent</span>
          <input name="default_tax_percent" type="number" step="0.01" defaultValue={settings?.default_tax_percent || 18} className="w-full border rounded-lg px-3 py-2 mt-1" />
        </label>
        <label className="block">
          <span className="text-gray-500 text-xs">Currency</span>
          <input name="currency" defaultValue={settings?.currency || 'INR'} className="w-full border rounded-lg px-3 py-2 mt-1" />
        </label>
        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-gray-900">Online store delivery</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-gray-500 text-xs">Delivery charge per order (₹)</span>
              <input name="delivery_charge" type="number" min={0} step="0.01" defaultValue={settings?.delivery_charge ?? 0} className="w-full border rounded-lg px-3 py-2 mt-1" />
            </label>
            <label className="block">
              <span className="text-gray-500 text-xs">Free delivery above (₹, optional)</span>
              <input name="free_delivery_above" type="number" min={0} step="0.01" defaultValue={settings?.free_delivery_above ?? ''} placeholder="Leave blank for no threshold" className="w-full border rounded-lg px-3 py-2 mt-1" />
            </label>
          </div>
        </div>
        <button className="px-4 py-2 bg-[#9C7A33] text-white rounded-lg font-medium text-sm">Save settings</button>
      </form>

      <div className="mt-6 rounded-lg border bg-white p-6">
        <h2 className="text-sm font-bold text-gray-900">Integrations</h2>
        <p className="mt-1 text-xs text-gray-500">Credentials are set as server environment variables and are never shown here.</p>
        <ul className="mt-4 space-y-3 text-xs">
          <li className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">Payments (PayU)</p>
              <p className="text-gray-500">
                {paymentProvider === 'payu'
                  ? `Live gateway active (${process.env.PAYU_ENVIRONMENT === 'production' ? 'production' : 'test'} mode).`
                  : 'Demo payment mode. Set PAYMENT_PROVIDER=payu, PAYU_KEY, PAYU_SALT and PAYU_ENVIRONMENT to go live.'}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${paymentProvider === 'payu' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
              {paymentProvider === 'payu' ? 'Connected' : 'Demo'}
            </span>
          </li>
          <li className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">WhatsApp notifications</p>
              <p className="text-gray-500">
                {whatsappReady
                  ? 'Order, payment and sample messages are being sent.'
                  : 'Messages are generated and logged but not sent. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to start sending.'}
              </p>
              <Link href="/crm/notifications" className="mt-1 inline-block font-semibold text-[#9C7A33] hover:underline">View notification log →</Link>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${whatsappReady ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
              {whatsappReady ? 'Connected' : 'Not connected'}
            </span>
          </li>
          <li className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">Email (Resend)</p>
              <p className="text-gray-500">{emailReady ? 'Transactional email is configured.' : 'Set RESEND_API_KEY and RESEND_FROM_EMAIL.'}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${emailReady ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
              {emailReady ? 'Connected' : 'Not connected'}
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-lg border bg-white p-6">
        <h2 className="text-sm font-bold text-gray-900">Role permissions</h2>
        <p className="mt-1 text-xs text-gray-500">
          Control which roles can manage suppliers, procurement and other granular internal permissions.
        </p>
        <Link href="/crm/settings/permissions" className="mt-3 inline-block text-xs font-semibold text-[#9C7A33] hover:underline">
          Manage role permissions →
        </Link>
      </div>
    </div>
  )
}
