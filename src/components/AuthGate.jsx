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
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session ?? null); });
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
