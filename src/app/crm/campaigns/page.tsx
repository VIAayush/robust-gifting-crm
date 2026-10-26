import { redirect } from 'next/navigation'

// Campaigns became Catalogues (Products > Catalogues); keep old links working.
export default function CampaignsRedirect() {
  redirect('/crm/products/catalogues')
}
