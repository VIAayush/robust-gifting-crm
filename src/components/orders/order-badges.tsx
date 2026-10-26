const PAYMENT_LABEL: Record<string, string> = {
  not_applicable: 'Not applicable',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
}

const PAYMENT_STYLE: Record<string, string> = {
  not_applicable: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-blue-50 text-blue-700',
}

export function OrderTypeBadge({ type }: { type: string | null | undefined }) {
  const isB2c = type === 'b2c'
  return (
    <span
      title={isB2c ? 'Online personalized-gifts order' : 'Corporate order'}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isB2c ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {isB2c ? 'B2C' : 'B2B'}
    </span>
  )
}

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  const key = status || 'not_applicable'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STYLE[key] || PAYMENT_STYLE.not_applicable}`}>
      {PAYMENT_LABEL[key] || key}
    </span>
  )
}
