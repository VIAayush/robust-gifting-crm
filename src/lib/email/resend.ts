const RESEND_API_URL = 'https://api.resend.com/emails'

export type SendEmailResult = { ok: true } | { ok: false; error: string }

/** Server-only. Sends transactional email via Resend. Never import from a Client Component. */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    console.error('[resend] RESEND_API_KEY or RESEND_FROM_EMAIL is not configured')
    return { ok: false, error: 'Email is not configured' }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[resend] send failed:', response.status, body)
    return { ok: false, error: 'Failed to send email' }
  }

  return { ok: true }
}
