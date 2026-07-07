// ─── Supabase auth client ──────────────────────────────────────────
// Email + password accounts for Nook. This is a client-only Vite SPA,
// so we use Supabase's hosted auth (no server of our own).
//
// Setup (see notes at the bottom of this file):
//   1. Create a project at https://supabase.com
//   2. Project Settings → API → copy the Project URL and the `anon` public key
//   3. Add them to .env.local (and to Vercel → Settings → Environment Variables):
//        VITE_SUPABASE_URL=https://xxxx.supabase.co
//        VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
//   4. Restart the dev server / redeploy.
//
// Until both env vars are present, `isAuthConfigured` is false and the app
// runs exactly as before (no login gate) — so nothing breaks in the meantime.

import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isAuthConfigured = Boolean(url && anonKey);

export const supabase = isAuthConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Friendly labels for common Supabase auth errors.
export function friendlyAuthError(message = '') {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already exists')) return 'That email is already registered — try signing in.';
  if (m.includes('password should be')) return 'Password must be at least 6 characters.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (m.includes('unable to validate email')) return 'That email address looks invalid.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — please wait a moment and try again.';
  return message || 'Something went wrong. Please try again.';
}
