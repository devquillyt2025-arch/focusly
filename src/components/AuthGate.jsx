import { useState, useEffect } from 'react';
import { supabase, isAuthConfigured } from '../utils/authClient';
import AuthPage from './AuthPage';

// Gates the app behind email/password auth — but ONLY when Supabase env vars
// are present. Without them, the app renders exactly as before (no login),
// so adding this can't break the existing experience.
export default function AuthGate({ children }) {
  // undefined = still checking the session; null = signed out; object = signed in
  const [session, setSession] = useState(isAuthConfigured ? undefined : null);

  useEffect(() => {
    if (!isAuthConfigured) return;
    let active = true;

    (async () => {
      // Cross-app SSO handoff: the marketing/landing login page (a separate
      // origin) signs the user in with its own Supabase client and hands off
      // the resulting session via a URL hash using custom key names
      // (`sb_access_token`/`sb_refresh_token`) so it never collides with
      // Supabase's own OAuth/magic-link hash format, which this app's
      // `detectSessionInUrl` already handles natively for its own Google
      // sign-in and password-reset flows. Consume it once, then scrub the
      // hash so the tokens never linger in the URL or browser history.
      const hash = window.location.hash;
      if (hash.includes('sb_access_token=')) {
        const params = new URLSearchParams(hash.slice(1));
        const access_token = params.get('sb_access_token');
        const refresh_token = params.get('sb_refresh_token');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
      const { data } = await supabase.auth.getSession();
      if (active) setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!isAuthConfigured) return children;

  if (session === undefined) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg-base)' }}>
        <span className="tab-fallback-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!session) return <AuthPage />;

  return children;
}
