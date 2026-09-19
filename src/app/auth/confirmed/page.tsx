import { ConfirmedRedirect } from '@/components/auth/confirmed-redirect'

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>
}) {
  const { flow = '' } = await searchParams
  return <ConfirmedRedirect flow={flow} />
}
