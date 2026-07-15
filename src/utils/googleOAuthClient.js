// ─── Google OAuth token exchange — client side ─────────────────────────
// The Google client_secret must never reach the browser: any Vite env var
// prefixed VITE_ is inlined into the shipped bundle. So the auth-code →
// token exchange and the token refresh both run in the `google-oauth` Edge
// Function (see supabase/functions/google-oauth/index.ts), which holds the
// secret server-side. The browser only ever needs the public client_id to
// run the interactive consent.
//
// Shared by googleTasksSync and googleCalendarSync — both use the same
// OAuth client and the same two grants.
//
// Because the Edge Function verifies the caller's Supabase session,
// connecting or refreshing Google Tasks/Calendar requires Supabase to be
// configured and the user to be signed in.

import { supabase } from './authClient';

// supabase-js hides an Edge Function's JSON error body on a non-2xx response —
// it only sets a generic FunctionsHttpError message and stashes the raw
// Response on error.context. Pull the real { error } out of it so failures are
// actionable instead of "returned a non-2xx status code".
async function edgeErrorDetail(error, fallback) {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.clone === 'function') {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) return body.error;
    }
  } catch { /* fall through */ }
  return error?.message || fallback;
}

// body: { grant: 'authorization_code', code, codeVerifier, redirectUri }
//    or { grant: 'refresh_token', refreshToken }
//
// Resolves to { access_token, refresh_token, expires_in }, or throws.
// A thrown message starting with 'token_exchange_failed' means Google itself
// rejected the request (expired/revoked) — callers use that to decide whether
// to tear the connection down. Anything else is transient.
export async function invokeGoogleOAuth(body) {
  if (!supabase) throw new Error('Sign-in is not configured, so Google auth cannot run server-side.');
  const { data, error } = await supabase.functions.invoke('google-oauth', { body });
  if (error) throw new Error(await edgeErrorDetail(error, 'token exchange failed'));
  if (data?.error) throw new Error(data.error);
  if (!data?.access_token) throw new Error('token exchange returned no access_token');
  return data;
}
