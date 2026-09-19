import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { RECOVERY_COOKIE_NAME } from '@/lib/auth/tab'

function otpType(value: string | null): EmailOtpType {
  if (value === 'recovery' || value === 'email' || value === 'magiclink' || value === 'signup') return value
  return 'recovery'
}

/** Where to land once the token/code has been exchanged for a session. Signup confirmations sign a brand-new user in; everything else (recovery, email change) still needs the reset-password form. */
function destinationFor(type: EmailOtpType) {
  return type === 'signup' ? '/login?confirmed=1' : '/reset-password'
}

function redirectWithCookies(
  request: NextRequest,
  path: string,
  cookiesToCopy?: Array<{ name: string; value: string; options?: any }>,
) {
  const url = new URL(path, request.nextUrl.origin)
  const response = NextResponse.redirect(url)
  cookiesToCopy?.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
  return response
}

export async function GET(request: NextRequest) {
  const incoming = request.nextUrl
  const code = incoming.searchParams.get('code')
  const tokenHash = incoming.searchParams.get('token_hash')
  const type = otpType(incoming.searchParams.get('type'))

  // No query credential: hash tokens are client-only. Pass through to the form.
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/reset-password', incoming.origin))
  }

  const pendingCookies: Array<{ name: string; value: string; options?: any }> = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: RECOVERY_COOKIE_NAME,
        path: '/',
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          pendingCookies.length = 0
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            pendingCookies.push({ name, value, options })
          })
        },
      },
    },
  )

  const errorDestination = type === 'signup' ? '/login?error=invalid-link' : '/reset-password?error=invalid'
  const destination = destinationFor(type)

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) {
      return NextResponse.redirect(new URL(errorDestination, incoming.origin))
    }
    return redirectWithCookies(request, destination, cookiesForRedirect(request, pendingCookies))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code as string)
  if (error) {
    return NextResponse.redirect(new URL(errorDestination, incoming.origin))
  }
  return redirectWithCookies(request, destination, cookiesForRedirect(request, pendingCookies))
}

function cookiesForRedirect(
  request: NextRequest,
  pending: Array<{ name: string; value: string; options?: any }>,
) {
  if (pending.length) return pending
  return request.cookies.getAll()
    .filter((cookie) => cookie.name === RECOVERY_COOKIE_NAME || cookie.name.startsWith(`${RECOVERY_COOKIE_NAME}.`))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      options: { path: '/', sameSite: 'lax' as const, httpOnly: true },
    }))
}
