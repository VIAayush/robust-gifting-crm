import { redirect } from 'next/navigation'

// The Interest List was merged into the Shortlist; keep old links working.
export default function PortalInterestRedirect() {
  redirect('/portal/shortlist')
}
