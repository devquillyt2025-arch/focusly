// ═══════════════════════════════════════════════════════════════════
// connect-drive — one-time Google Drive "offline access" consent exchange.
//
// The browser runs the interactive consent (access_type=offline &
// prompt=consent, scope=drive.file) and sends the returned auth `code`
// here. This function exchanges it for tokens SERVER-SIDE (needs the
// client_secret) and stores the long-lived refresh token in Supabase
// Vault via set_drive_refresh_token — the refresh token never returns to
// the client. The drive-backup function later mints access tokens from it.
//
// User-authenticated: deploy WITH jwt verification (do NOT use
// --no-verify-jwt here — unlike the cron-triggered send-task-reminders).
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  // 1. Verify the caller's Supabase session.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthenticated' }, 401);

  // 2. Read the auth code the browser obtained from Google.
  let payload: { code?: string; redirectUri?: string };
  try { payload = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const { code, redirectUri } = payload;
  if (!code || !redirectUri) return json({ error: 'missing code/redirectUri' }, 400);

  // 3. Exchange the code for tokens (server-side — needs client_secret).
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return json({ error: `token_exchange_failed: ${await tokenRes.text()}` }, 400);

  const tok = await tokenRes.json();
  if (!tok.refresh_token) {
    // Google only returns a refresh token on the first consent, or when
    // prompt=consent forces re-consent. Surface this clearly.
    return json({ error: 'no_refresh_token — re-consent with prompt=consent & access_type=offline' }, 400);
  }

  // 4. Store the refresh token in Vault via the SECURITY DEFINER RPC.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.rpc('set_drive_refresh_token', { p_user: user.id, p_token: tok.refresh_token });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});
