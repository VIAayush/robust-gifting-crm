export function confirmSignupEmail({ confirmUrl, name }: { confirmUrl: string; name: string }): { subject: string; html: string } {
  return {
    subject: 'Confirm your Robust Gifting account',
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#0D1B2A;padding:28px 32px;">
                <span style="font-size:20px;color:#ffffff;">Robust Gifting</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#1B2430;font-weight:normal;">Confirm your email</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5C6570;font-family:Arial,sans-serif;">
                  ${name ? `Hi ${name}, thanks` : 'Thanks'} for creating a Robust Gifting account. Click the button below to confirm your email address and sign in.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#9C7A33;border-radius:6px;">
                      <a href="${confirmUrl}" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">
                        Confirm email
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94A3B8;font-family:Arial,sans-serif;">
                  If you didn't create this account, you can safely ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:11px;color:#94A3B8;font-family:Arial,sans-serif;">
                  Robust Gifting — Corporate gifting, from enquiry to payment.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

export function passwordResetEmail({ resetUrl }: { resetUrl: string }): { subject: string; html: string } {
  return {
    subject: 'Reset your Robust Gifting password',
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#0D1B2A;padding:28px 32px;">
                <span style="font-size:20px;color:#ffffff;">Robust Gifting</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#1B2430;font-weight:normal;">Reset your password</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5C6570;font-family:Arial,sans-serif;">
                  We received a request to reset the password for your Robust Gifting account. Click the button below to choose a new one. This link expires in 1 hour.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#9C7A33;border-radius:6px;">
                      <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94A3B8;font-family:Arial,sans-serif;">
                  If you didn't request this, you can safely ignore this email — your password will not be changed.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:11px;color:#94A3B8;font-family:Arial,sans-serif;">
                  Robust Gifting — Corporate gifting, from enquiry to payment.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function teamInviteEmail({
  setPasswordUrl,
  name,
  roleLabel,
  invitedBy,
}: {
  setPasswordUrl: string
  name: string
  roleLabel: string
  invitedBy: string
}): { subject: string; html: string } {
  const safeName = escapeHtml(name)
  const safeRole = escapeHtml(roleLabel)
  const safeInviter = escapeHtml(invitedBy)
  return {
    subject: 'You have been invited to Robust Gifting',
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#0D1B2A;padding:28px 32px;">
                <span style="font-size:20px;color:#ffffff;">Robust Gifting</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#1B2430;font-weight:normal;">Welcome, ${safeName}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5C6570;font-family:Arial,sans-serif;">
                  ${safeInviter} has given you access to the Robust Gifting CRM as <strong>${safeRole}</strong>. Click the button below to set your password and sign in. This link expires in 1 hour; if it does, ask your admin to resend the invite or use "Forgot password" on the sign-in page.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#9C7A33;border-radius:6px;">
                      <a href="${setPasswordUrl}" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">
                        Set your password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94A3B8;font-family:Arial,sans-serif;">
                  If you weren't expecting this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

export function requirementUpdateEmail({
  name,
  requirementName,
  update,
  note,
  url,
}: {
  name: string
  requirementName: string
  update: string
  note: string | null
  url: string
}): { subject: string; html: string } {
  const safeName = escapeHtml(name)
  const safeRequirement = escapeHtml(requirementName)
  const safeUpdate = escapeHtml(update)
  const safeNote = note ? escapeHtml(note).replace(/\n/g, '<br />') : ''
  const safeUrl = escapeHtml(url)
  return {
    subject: `Update on your requirement: ${requirementName}`.slice(0, 150),
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr><td style="background-color:#0D1B2A;padding:28px 32px;"><span style="font-size:20px;color:#ffffff;">Robust Gifting</span></td></tr>
            <tr>
              <td style="padding:32px;color:#1B2430;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 12px;">Hi ${safeName},</p>
                <p style="margin:0 0 12px;">Update on your requirement <strong>${safeRequirement}</strong>: ${safeUpdate}.</p>
                ${safeNote ? `<p style="margin:0 0 12px;padding:12px;background:#F5F7FA;border-radius:6px;">${safeNote}</p>` : ''}
                <p style="margin:24px 0 0;"><a href="${safeUrl}" style="background:#9C7A33;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;">Open requirement</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

export function staffAlertEmail({ title, lines, url }: { title: string; lines: string[]; url: string }): { subject: string; html: string } {
  const safeTitle = escapeHtml(title)
  const body = lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join('')
  const safeUrl = escapeHtml(url)
  return {
    subject: `[Robust Gifting CRM] ${title}`.slice(0, 150),
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr><td style="background-color:#0D1B2A;padding:24px 32px;"><span style="font-size:18px;color:#ffffff;">Robust Gifting CRM</span></td></tr>
            <tr>
              <td style="padding:28px 32px;color:#1B2430;font-size:15px;line-height:1.6;">
                <h1 style="margin:0 0 14px;font-size:18px;font-weight:normal;">${safeTitle}</h1>
                ${body}
                <p style="margin:20px 0 0;"><a href="${safeUrl}" style="background:#9C7A33;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;">Open in CRM</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

export function productAvailableEmail({ name, summary, url }: { name: string; summary: string; url: string }): { subject: string; html: string } {
  const safeName = escapeHtml(name)
  const safeSummary = escapeHtml(summary)
  const safeUrl = escapeHtml(url)
  return {
    subject: 'New products in your Robust Gifting catalogue',
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr><td style="background-color:#0D1B2A;padding:28px 32px;"><span style="font-size:20px;color:#ffffff;">Robust Gifting</span></td></tr>
            <tr>
              <td style="padding:32px;color:#1B2430;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 12px;">Hi ${safeName},</p>
                <p style="margin:0 0 12px;">New in your catalogue: <strong>${safeSummary}</strong>.</p>
                <p style="margin:24px 0 0;"><a href="${safeUrl}" style="background:#9C7A33;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;">View in your portal</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}

export function orderEmail({
  name,
  title,
  lines,
  trackUrl,
  orderNumber,
}: {
  name: string
  title: string
  lines: string[]
  trackUrl: string
  orderNumber: string
}): { subject: string; html: string } {
  const safeName = escapeHtml(name)
  const safeTitle = escapeHtml(title)
  const body = lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join('')
  const safeUrl = escapeHtml(trackUrl)
  const safeOrder = escapeHtml(orderNumber)
  return {
    subject: title.slice(0, 150),
    html: `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F1F4F9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F4F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr><td style="background-color:#0D1B2A;padding:28px 32px;"><span style="font-size:20px;color:#ffffff;">Robust Gifting</span></td></tr>
            <tr>
              <td style="padding:32px;color:#1B2430;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 12px;">Hi ${safeName},</p>
                <h1 style="margin:0 0 14px;font-size:18px;font-weight:normal;">${safeTitle}</h1>
                ${body}
                <p style="margin:18px 0 0;font-size:13px;color:#5C6570;">Track your order any time with order number <strong>${safeOrder}</strong> and this email address.</p>
                <p style="margin:18px 0 0;"><a href="${safeUrl}" style="background:#9C7A33;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;">Track your order</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim(),
  }
}
