import { randomBytes } from 'crypto'

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%'

export function generateTemporaryPassword(length = 12) {
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length]).join('')
}

export function validateNewPassword(password: string, confirm?: string) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  if (confirm !== undefined && password !== confirm) {
    return 'Passwords do not match'
  }
  return null
}

export const SERVICE_ROLE_MISSING =
  'Client login cannot be created until SUPABASE_SERVICE_ROLE_KEY is configured as a server-only environment variable on the host (for Vercel: Project Settings → Environment Variables). Never use a NEXT_PUBLIC_ name for this key.'
