import { redirect } from 'next/navigation'

// Campaigns are now called Catalogues; keep old links working.
export default function PortalCampaignsRedirect() {
  redirect('/portal/catalogues')
}
