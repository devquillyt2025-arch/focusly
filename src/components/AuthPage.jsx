import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, friendlyAuthError } from '../utils/authClient';

// ─── Full-screen email/password login + signup ─────────────────────
export default function AuthPage() {
  const [mode,     setMode]     = useState('signin'); // 'signin' | 'signup'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [notice,   setNotice]   = useState('');

  const switchMode = (m) => { setMode(m); setError(''); setNotice(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'signup' && password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // AuthGate's onAuthStateChange listener swaps in the app on success.
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data?.user && !data?.session) {
          setNotice('Account created! Check your inbox to confirm your email, then sign in.');
          setMode('signin');
          setPassword('');
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) { setError('Enter your email above first, then tap reset.'); return; }
    setError(''); setNotice(''); setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/' });
      if (error) throw error;
      setNotice('Password reset link sent — check your inbox.');
    } catch (err) {
      setError(friendlyAuthError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(''); setNotice(''); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' },
      });
      if (error) throw error;
      // Browser redirects to Google here; on return AuthGate picks up the session.
    } catch (err) {
      setError(friendlyAuthError(err?.message));
      setLoading(false);
    }
  };

  const inputWrap = { position: 'relative', display: 'flex', alignItems: 'center' };
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px 12px 42px',
    borderRadius: 12, fontSize: '0.92rem', fontFamily: 'inherit',
    background: 'var(--surface-nested)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', outline: 'none',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  };
  const leftIcon = { position: 'absolute', left: 14, color: 'var(--text-muted)', pointerEvents: 'none', display: 'flex' };
  const onFocus = (e) => { e.target.style.borderColor = 'var(--border-accent)'; e.target.style.boxShadow = '0 0 0 4px var(--accent-glow2)'; };
  const onBlur  = (e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; };

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      background: `
        radial-gradient(900px 500px at 78% -10%, var(--accent-glow), transparent 60%),
        radial-gradient(760px 460px at 10% 110%, rgba(157,147,255,0.10), transparent 60%),
        var(--bg-base)`,
      fontFamily: 'var(--font)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%', maxWidth: 400, boxSizing: 'border-box',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 40%), var(--surface-panel)',
          border: '1px solid var(--border)', borderRadius: 22,
          boxShadow: '0 30px 80px -24px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
          padding: '30px 28px 26px',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, marginBottom: 22 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 16, marginBottom: 8,
            display: 'grid', placeItems: 'center', color: '#fff',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
            boxShadow: '0 14px 30px -10px var(--accent), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
            </svg>
          </div>
          <h1 style={{
            margin: 0, fontSize: '1.5rem', fontWeight: 850, letterSpacing: '-0.03em',
            background: 'linear-gradient(115deg, var(--text-primary) 20%, var(--accent-light) 120%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Nook</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {mode === 'signin' ? 'Welcome back — sign in to continue' : 'Create your account to get started'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-nested)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20 }}>
          {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => switchMode(val)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 700,
                color: mode === val ? '#fff' : 'var(--text-secondary)',
                background: mode === val ? 'linear-gradient(135deg, var(--accent), var(--accent-light))' : 'transparent',
                boxShadow: mode === val ? '0 6px 16px -6px var(--accent)' : 'none',
                transition: 'all 0.18s ease',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Continue with Google */}
        <button type="button" onClick={signInWithGoogle} disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 0', borderRadius: 12, cursor: loading ? 'default' : 'pointer',
            border: '1px solid var(--border-strong)', background: 'var(--surface-nested)',
            color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 650,
            transition: 'border-color 0.18s ease, transform 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.transform = 'none'; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>or</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={inputWrap}>
            <span style={leftIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
            </span>
            <input type="email" autoComplete="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} onFocus={onFocus} onBlur={onBlur} style={inputStyle} />
          </div>

          <div style={inputWrap}>
            <span style={leftIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
            <input type={showPw ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Your password'} value={password}
              onChange={e => setPassword(e.target.value)} onFocus={onFocus} onBlur={onBlur}
              style={{ ...inputStyle, paddingRight: 42 }} />
            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 10, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
              {showPw
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>

          {/* Banners */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ fontSize: '0.8rem', color: 'var(--color-red)', background: 'var(--color-red-bg)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '9px 12px' }}>
                {error}
              </motion.div>
            )}
            {notice && (
              <motion.div key="ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ fontSize: '0.8rem', color: 'var(--color-green)', background: 'var(--color-green-bg)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, padding: '9px 12px' }}>
                {notice}
              </motion.div>
            )}
          </AnimatePresence>

          <button type="submit" disabled={loading}
            style={{
              marginTop: 4, padding: '12px 0', borderRadius: 12, border: 'none',
              fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 700, color: '#fff',
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
              boxShadow: '0 12px 26px -10px var(--accent), inset 0 1px 0 rgba(255,255,255,0.22)',
              transition: 'filter 0.18s ease',
            }}>
            {loading && (
              <svg style={{ animation: 'customSpin 0.8s linear infinite', width: 16, height: 16 }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'signin' && (
            <button type="button" onClick={resetPassword} disabled={loading}
              style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: '2px 0', alignSelf: 'center' }}>
              Forgot password?
            </button>
          )}
        </form>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {mode === 'signin'
            ? <>New here? <button type="button" onClick={() => switchMode('signup')} style={linkBtn}>Create an account</button></>
            : <>Already have an account? <button type="button" onClick={() => switchMode('signin')} style={linkBtn}>Sign in</button></>}
        </div>
      </motion.div>

      <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const linkBtn = { background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 };
