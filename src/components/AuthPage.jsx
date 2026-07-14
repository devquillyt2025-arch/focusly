import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, friendlyAuthError } from '../utils/authClient';

// ─── Liquid Glass Full-screen login + signup ────────────────────────
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
    if (!email.trim() || !password) { setError('enter email and password.'); return; }
    if (mode === 'signup' && password.length < 6) { setError('password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data?.user && !data?.session) {
          setNotice('account created! check inbox to confirm.');
          setMode('signin');
          setPassword('');
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err?.message).toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) { setError('enter your email above first, then tap reset.'); return; }
    setError(''); setNotice(''); setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/' });
      if (error) throw error;
      setNotice('password reset link sent — check your inbox.');
    } catch (err) {
      setError(friendlyAuthError(err?.message).toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(''); setNotice(''); setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo: window.location.origin + '/',
          skipBrowserRedirect: true 
        },
      });
      if (error) throw error;
      if (data?.url) window.location.assign(data.url);
    } catch (err) {
      setError(friendlyAuthError(err?.message).toLowerCase());
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      background: '#050505',
      fontFamily: 'var(--font)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96, filter: 'blur(14px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="liquid-glass"
        style={{ width: '100%', maxWidth: 440, padding: '40px' }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Brand */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{
              margin: 0, fontSize: '3rem', fontWeight: 500, letterSpacing: '0.06em',
              background: 'linear-gradient(100deg, #e0e7ff 0%, hsla(244, 95%, 78%, 1) 45%, hsla(289, 95%, 80%, 1) 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
              color: 'transparent'
            }}>
              nook
            </h1>
            <p style={{ marginTop: 12, fontSize: '0.875rem', fontWeight: 300, letterSpacing: '0.15em', color: 'rgba(224, 231, 255, 0.55)', textTransform: 'lowercase' }}>
              {mode === 'signin' ? 'welcome back' : 'create account'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <input type="email" autoComplete="email" placeholder="you@somewhere.com" value={email}
                onChange={e => setEmail(e.target.value)} className="liquid-input" style={{ paddingLeft: '1rem' }} />
            </div>

            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? 'password (min 6 chars)' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} className="liquid-input" style={{ paddingLeft: '1rem', paddingRight: 42 }} />
              <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(224,231,255,0.4)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                {showPw
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>

            {mode === 'signin' && (
              <div style={{ marginTop: '-4px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={resetPassword} disabled={loading}
                  style={{ background: 'none', border: 'none', color: 'rgba(224,231,255,0.4)', fontSize: '0.75rem', cursor: 'pointer', padding: 0, transition: 'color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(224,231,255,0.7)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(224,231,255,0.4)'}
                >
                  forgot?
                </button>
              </div>
            )}

            {/* Banners */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ fontSize: '0.8rem', color: '#fca5a5', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '10px 14px' }}>
                  {error}
                </motion.div>
              )}
              {notice && (
                <motion.div key="ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ fontSize: '0.8rem', color: '#6ee7b7', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12, padding: '10px 14px' }}>
                  {notice}
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" disabled={loading}
              style={{
                marginTop: 8, padding: '12px 20px', borderRadius: 12, border: 'none',
                fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 500, color: '#050505',
                background: 'rgba(224, 231, 255, 0.95)',
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.8 : 1,
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={e => { if(!loading) e.currentTarget.style.background = '#ffffff' }}
              onMouseLeave={e => { if(!loading) e.currentTarget.style.background = 'rgba(224, 231, 255, 0.95)' }}
            >
              {loading ? 'signing in…' : mode === 'signin' ? 'sign in' : 'create account'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(224,231,255,0.3)' }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            or
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <button type="button" onClick={signInWithGoogle} disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 12, cursor: loading ? 'default' : 'pointer',
                border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                color: 'rgba(224,231,255,0.8)', fontFamily: 'inherit', fontSize: '0.875rem',
                backdropFilter: 'blur(4px)', transition: 'background 0.2s ease'
              }}
              onMouseEnter={e => { if(!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { if(!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            >
              google
            </button>
          </div>

          <p style={{ marginTop: 32, textAlign: 'center', fontSize: '0.75rem', color: 'rgba(224,231,255,0.35)' }}>
            {mode === 'signin'
              ? <>new here? <button type="button" onClick={() => switchMode('signup')} style={linkBtn}>create an account</button></>
              : <>already have an account? <button type="button" onClick={() => switchMode('signin')} style={linkBtn}>sign in</button></>}
          </p>

        </div>
      </motion.div>
    </div>
  );
}

const linkBtn = { background: 'none', border: 'none', color: 'rgba(224,231,255,0.6)', fontSize: '0.75rem', textDecoration: 'underline', textUnderlineOffset: '4px', cursor: 'pointer', padding: 0, marginLeft: 4, transition: 'color 0.2s' };
