// ═══════════════════════════════════════════════════════════════════
// google-oauth — server-side Google OAuth token exchange for the Tasks
// and Calendar integrations.
//
// The client_secret must never reach the browser: any Vite env var with a
// VITE_ prefix is inlined into the shipped bundle. The browser therefore
// runs the interactive consent (it only needs the public client_id) and
// sends the resulting auth `code` — plus the PKCE verifier — here. This
// function holds the secret and performs the exchange.
//
// Unlike connect-drive, the tokens ARE returned to the caller: Tasks and
// Calendar call googleapis.com directly from the browser and keep their
// tokens in localStorage. This function's job is only to keep the
// client_secret server-side, not to take custody of the tokens.
//
// Two grants:
//   { grant: 'authorization_code', code, codeVerifier, redirectUri }
//   { grant: 'refresh_token', refreshToken }
//
// User-authenticated: deploy WITH jwt verification (do NOT use
// --no-verify-jwt), same as connect-drive.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

// Browser-invoked (supabase.functions.invoke), so CORS must be handled: the
// preflight OPTIONS carries no auth header and is let through by the platform
// regardless of verify_jwt, so the function itself must answer it.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // 1. Verify the caller's Supabase session.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthenticated' }, 401);

  // 2. Read the grant the browser is asking for.
  let payload: { grant?: string; code?: string; codeVerifier?: string; redirectUri?: string; refreshToken?: string };
  try { payload = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const { grant, code, codeVerifier, redirectUri, refreshToken } = payload;

  // 3. Build the token request body for the requested grant.
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
  });

  if (grant === 'authorization_code') {
    if (!code || !codeVerifier || !redirectUri) return json({ error: 'missing code/codeVerifier/redirectUri' }, 400);
    body.set('code', code);
    body.set('code_verifier', codeVerifier);
    body.set('redirect_uri', redirectUri);
    body.set('grant_type', 'authorization_code');
  } else if (grant === 'refresh_token') {
    if (!refreshToken) return json({ error: 'missing refreshToken' }, 400);
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');
  } else {
    return json({ error: 'unsupported grant' }, 400);
  }

  // 4. Exchange server-side (this is the only place the client_secret exists).
  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    return json({ error: `token_request_failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  const text = await tokenRes.text();
  if (!tokenRes.ok) return json({ error: `token_exchange_failed: ${text}` }, tokenRes.status);

  let tok: { access_token?: string; refresh_token?: string; expires_in?: number };
  try { tok = JSON.parse(text); } catch { return json({ error: 'token_response_not_json' }, 502); }

  // 5. Return only the token fields the client needs — never echo the raw
  //    Google response (it can carry id_token / scope noise).
  return json({
    access_token: tok.access_token ?? null,
    refresh_token: tok.refresh_token ?? null,
    expires_in: tok.expires_in ?? 3600,
  });
});
