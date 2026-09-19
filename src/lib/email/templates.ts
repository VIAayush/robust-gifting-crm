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
