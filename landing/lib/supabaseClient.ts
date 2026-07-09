'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client for the landing app's login page.
 *
 * This mirrors `src/utils/authClient.js` in the main (Vite) app — same
 * Supabase project, same auth settings. The two apps are separate
 * deployments (separate origins), so a session created here does NOT
 * automatically appear in the main app; see `handoffUrl()` below and
 * `src/components/AuthGate.jsx` for how the session crosses origins.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isAuthConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // No need to persist a session in landing's own storage — either the
        // user is handed off to the dashboard immediately (password flow,
        // see handoffUrl) or the browser navigates away entirely for OAuth.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Friendly labels for common Supabase auth errors — kept in sync with the main app's copy. */
export function friendlyAuthError(message = ''): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already exists'))
    return 'That email is already registered — try signing in.';
  if (m.includes('password should be')) return 'Password must be at least 6 characters.';
  if (m.includes('email not confirmed'))
    return 'Please confirm your email first — check your inbox.';
  if (m.includes('unable to validate email')) return 'That email address looks invalid.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts — please wait a moment and try again.';
  if (m.includes('unsupported provider') || m.includes('provider is not enabled'))
    return 'That sign-in method isn’t enabled yet — try email instead.';
  return message || 'Something went wrong. Please try again.';
}

/** The deployed nook dashboard's origin. Configurable per environment. */
export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

/**
 * Builds the cross-origin session handoff URL for the dashboard.
 *
 * Landing and the main app are separate deployments (separate origins), so a
 * session signed in here can't be read from the dashboard's own storage.
 * Custom-named hash params (not Supabase's own `access_token=`/`refresh_token=`
 * keys) avoid colliding with the main app's `detectSessionInUrl` OAuth/magic-link
 * parser — `AuthGate.jsx` reads these specific keys once on load, calls
 * `supabase.auth.setSession(...)`, and immediately scrubs them from the URL.
 */
export function handoffUrl(accessToken: string, refreshToken: string): string {
  const params = new URLSearchParams({
    sb_access_token: accessToken,
    sb_refresh_token: refreshToken,
  });
  return `${getAppUrl()}/#${params.toString()}`;
}
