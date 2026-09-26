import { templateParams, type TemplateKey } from './templates'

export type SendInput = {
  to: string
  templateKey: TemplateKey
  payload: Record<string, string>
  text: string
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean }

export interface NotificationProvider {
  name: string
  send(input: SendInput): Promise<SendResult>
}

/**
 * Meta WhatsApp Cloud API (graph.facebook.com/{version}/{phone-number-id}/messages).
 *
 * Env:
 *   WHATSAPP_ACCESS_TOKEN      permanent/system-user token (server-only, never NEXT_PUBLIC_)
 *   WHATSAPP_PHONE_NUMBER_ID   the sender number's ID from WhatsApp Manager
 *   WHATSAPP_API_VERSION       optional, defaults to v21.0
 *   WHATSAPP_USE_TEMPLATES     'true' to send approved templates (required for
 *                              business-initiated messages outside the 24h
 *                              customer-service window); otherwise plain text
 *   WHATSAPP_TEMPLATE_LANGUAGE optional, defaults to en
 */
export class WhatsAppCloudProvider implements NotificationProvider {
  name = 'whatsapp_cloud'

  async send(input: SendInput): Promise<SendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!token || !phoneNumberId) return { ok: false, error: 'WhatsApp is not configured', retryable: false }
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
    const useTemplates = process.env.WHATSAPP_USE_TEMPLATES === 'true'

    const body = useTemplates
      ? {
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: input.templateKey,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
            components: [
              {
                type: 'body',
                parameters: templateParams(input.templateKey, input.payload).map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }
      : { messaging_product: 'whatsapp', to: input.to, type: 'text', text: { body: input.text } }

    let response: Response
    try {
      response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (error) {
      return { ok: false, error: `Could not reach WhatsApp: ${(error as Error).message}`, retryable: true }
    }

    const json = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { message?: string }
    }
    if (!response.ok) {
      return {
        ok: false,
        error: json.error?.message || `WhatsApp API returned HTTP ${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      }
    }
    return { ok: true, providerMessageId: json.messages?.[0]?.id || null }
  }
}

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

/** Null when no provider is configured - the dispatcher then marks rows 'skipped', never 'sent'. */
export function getNotificationProvider(): NotificationProvider | null {
  if (process.env.NOTIFICATIONS_ENABLED === 'false') return null
  return isWhatsAppConfigured() ? new WhatsAppCloudProvider() : null
}
