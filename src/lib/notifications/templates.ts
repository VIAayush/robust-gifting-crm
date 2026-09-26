/**
 * Message templates. Each template declares its body parameters in a fixed
 * ORDER so the same payload works both as a plain text message and as an
 * approved WhatsApp Business template ({{1}}, {{2}}, ... in that order).
 * When you register templates in WhatsApp Manager, create them with these
 * exact names and this parameter order.
 */
export type TemplateKey =
  | 'order_created_customer'
  | 'order_created_staff'
  | 'payment_success_customer'
  | 'payment_failed_customer'
  | 'order_status_customer'
  | 'order_status_staff'
  | 'sample_request_customer'
  | 'sample_request_staff'

type TemplateDef = {
  params: string[]
  render: (p: Record<string, string>) => string
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  order_created_customer: {
    params: ['customer_name', 'order_number', 'amount'],
    render: (p) => `Hi ${p.customer_name}, thank you for your order ${p.order_number} with Robust Gifting (${p.amount}). We will keep you posted as it progresses.`,
  },
  order_created_staff: {
    params: ['order_number', 'order_type', 'customer_name', 'amount'],
    render: (p) => `New ${p.order_type} order ${p.order_number} from ${p.customer_name} (${p.amount}). Please review it in the CRM.`,
  },
  payment_success_customer: {
    params: ['customer_name', 'amount', 'order_number'],
    render: (p) => `Hi ${p.customer_name}, we have received your payment of ${p.amount} for order ${p.order_number}. Thank you!`,
  },
  payment_failed_customer: {
    params: ['customer_name', 'amount'],
    render: (p) => `Hi ${p.customer_name}, your payment of ${p.amount} could not be completed. You can retry from your checkout page, or contact us for help.`,
  },
  order_status_customer: {
    params: ['customer_name', 'order_number', 'status'],
    render: (p) => `Hi ${p.customer_name}, your Robust Gifting order ${p.order_number} is now: ${p.status}.`,
  },
  order_status_staff: {
    params: ['order_number', 'status'],
    render: (p) => `Order ${p.order_number} moved to ${p.status}.`,
  },
  sample_request_customer: {
    params: ['customer_name', 'product_name'],
    render: (p) => `Hi ${p.customer_name}, we have received your sample request for ${p.product_name}. Our team will be in touch shortly.`,
  },
  sample_request_staff: {
    params: ['company_name', 'product_name', 'quantity'],
    render: (p) => `New sample request from ${p.company_name}: ${p.product_name} x ${p.quantity}. Review it in CRM > Samples.`,
  },
}

export function renderTemplate(key: TemplateKey, payload: Record<string, string>) {
  return TEMPLATES[key].render(payload)
}

export function templateParams(key: TemplateKey, payload: Record<string, string>) {
  return TEMPLATES[key].params.map((name) => payload[name] ?? '')
}
