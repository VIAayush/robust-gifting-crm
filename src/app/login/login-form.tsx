'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from './actions';
import { Mail, Loader2 } from 'lucide-react';
import { PasswordField } from '@/components/auth/password-field';
import { BrandName } from '@/components/brand/brand-name';
import { rememberThisTab, forgetRememberedTab } from '@/lib/auth/remember-client';
import { getTabId } from '@/lib/supabase/client';
import { TAB_QUERY } from '@/lib/auth/tab';

function isNextRedirect(err: unknown) {
  const digest =
    typeof err === 'object' && err && 'digest' in err
      ? String((err as { digest?: unknown }).digest)
      : ''
  return digest.startsWith('NEXT_REDIRECT')
}

export function LoginForm({
  next = '',
  resetSuccess = false,
  confirmedSuccess = false,
  linkError = '',
}: {
  next?: string;
  resetSuccess?: boolean;
  confirmedSuccess?: boolean;
  linkError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(linkError || null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const authenticate = async (loginEmail: string, loginPassword: string) => {
    if (!loginEmail.trim() || !loginPassword) {
      setError('Email and password are required');
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set('email', loginEmail);
    formData.set('password', loginPassword);
    formData.set('remember', rememberMe ? '1' : '0');
    // Sent explicitly rather than relying on the server sniffing a header or
    // URL query param for it — see the comment on createClient() for why.
    formData.set('tabId', getTabId());
    if (next) formData.set('next', next);
    try {
      const res = await signIn(formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (res?.redirectTo) {
        if (rememberMe) rememberThisTab();
        else forgetRememberedTab();
        // Carry this tab's own id explicitly on the destination URL. A plain
        // router.push() doesn't reliably run through the patched
        // history.pushState (Next's router can call the native one directly),
        // so the very next request can arrive with no tab id in the header or
        // URL — the proxy then falls back to the remembered-tab cookie, which
        // can point at a stale id from an earlier session in this browser and
        // miss the session cookie signIn() just wrote under this tab's real id.
        const dest = new URL(res.redirectTo, window.location.origin);
        dest.searchParams.set(TAB_QUERY, getTabId());
        router.push(`${dest.pathname}${dest.search}`);
        router.refresh();
        return;
      }
      setLoading(false);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      console.error(err);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await authenticate(email, password);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-[#F1F4F9] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="space-y-3 text-center sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/home" className="inline-block">
          <BrandName as="h1" className="font-serif text-3xl tracking-tight text-[#0D1B2A] sm:text-4xl" />
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4A5568]">
          Corporate Gifting CRM
        </p>
        <p className="text-xs leading-relaxed text-[#4A5568]">
          Corporate gifting, from enquiry to payment.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl border border-[#E2E8F0] sm:px-10">
          <p className="text-sm text-[#64748B] mb-6 text-center">
            Sign in to <BrandName />
          </p>
          <form onSubmit={handleSubmit} className="space-y-5">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {resetSuccess && !error && (
              <div className="p-3 bg-green-50 text-green-800 text-xs rounded-xl border border-green-200">
                Password updated successfully. Please sign in with your new password.
              </div>
            )}
            {confirmedSuccess && !error && (
              <div className="p-3 bg-green-50 text-green-800 text-xs rounded-xl border border-green-200">
                Email confirmed. Please sign in below.
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="block w-full rounded-xl border border-[#E2E8F0] bg-[#F5F7FA] py-3 pl-10 pr-3 text-base text-[#0D1B2A] placeholder-gray-400 transition-colors focus:border-[#9C7A33] focus:outline-none focus:ring-1 focus:ring-[#9C7A33] sm:py-2.5 sm:text-xs"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-[11px] font-semibold text-[#9C7A33] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <PasswordField value={password} onChange={setPassword} />
            </div>

            <label className="flex items-center gap-2 text-xs text-[#4A5568]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#9C7A33] focus:ring-[#9C7A33]"
              />
              Keep me signed in on this device
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-xs font-semibold text-white bg-[#9C7A33] hover:bg-[#7C6224] hover:text-white focus:outline-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-center text-[#4A5568] mt-5">
            Need an account?{' '}
            <Link href="/signup" className="font-semibold text-[#9C7A33] hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
