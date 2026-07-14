'use client';

import { useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { supabase, isAuthConfigured, friendlyAuthError, getAppUrl, handoffUrl } from '@/lib/supabaseClient';
import { track } from '@/lib/analytics';

type Mode = 'signin' | 'signup';

/**
 * Liquid-glass login — the front door to the nook dashboard.
 *
 * Visual language is unchanged from the original (kept intentionally): the
 * SVG turbulence/displacement refraction, cursor-tracked specular, and moving
 * edge sheen. What's new is real auth underneath, mirroring the main app's
 * `AuthPage.jsx` (same Supabase project, same email/password + Google flow).
 *
 * Landing and the dashboard are separate deployments (separate origins), so a
 * session created here doesn't automatically exist there:
 *  - Google OAuth: `redirectTo` points straight at the dashboard's origin, so
 *    when Google redirects back, the dashboard's own `detectSessionInUrl`
 *    picks up the session natively — no handoff code needed for this path.
 *  - Email/password: there's no redirect involved, so we get a session back
 *    directly from `signInWithPassword`/`signUp` and hand its tokens to the
 *    dashboard via a URL hash (`handoffUrl`), which `AuthGate.jsx` on the
 *    other end consumes once via `supabase.auth.setSession(...)`.
 */
export default function LiquidGlassLogin() {
  const cardRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  const goToDashboard = (accessToken: string, refreshToken: string) => {
    track('sign_in');
    setDone(true);
    // Brief confirmation beat before handing off, matching the original UX.
    window.setTimeout(() => {
      window.location.href = handoffUrl(accessToken, refreshToken);
    }, 650);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (busy || done) return;
    if (!supabase || !isAuthConfigured) {
      setError('Sign-in isn’t configured for this environment yet.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data.session) {
          goToDashboard(data.session.access_token, data.session.refresh_token);
          return;
        }
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data.session) {
          // Email confirmation disabled on this project — session is ready now.
          goToDashboard(data.session.access_token, data.session.refresh_token);
          return;
        }
        if (data.user) {
          setNotice('Account created! Check your inbox to confirm your email, then sign in.');
          switchMode('signin');
          setPassword('');
        }
      }
    } catch (err) {
      setError(friendlyAuthError((err as Error)?.message));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!supabase || !isAuthConfigured) {
      setError('Sign-in isn’t configured for this environment yet.');
      return;
    }
    if (!email.trim()) {
      setError('Enter your email above first, then tap reset.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      // Supabase's own recovery-link redirect uses its native hash format
      // (`#access_token=...&type=recovery`), which the dashboard's
      // `detectSessionInUrl` already handles — no handoff bridge needed here.
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getAppUrl()}/`,
      });
      if (err) throw err;
      setNotice('Password reset link sent — check your inbox.');
    } catch (err) {
      setError(friendlyAuthError((err as Error)?.message));
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: 'google' | 'github') => {
    if (!supabase || !isAuthConfigured) {
      setError('Sign-in isn’t configured for this environment yet.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { 
          redirectTo: `${getAppUrl()}/`,
          skipBrowserRedirect: true
        },
      });
      if (err) throw err;
      // Hard redirect to avoid mobile Safari webview/ITP redirect drops
      if (data?.url) window.location.assign(data.url);
    } catch (err) {
      setError(friendlyAuthError((err as Error)?.message));
      setBusy(false);
    }
  };

  return (
    <>
      {/* The liquid displacement filter — animated turbulence drives the warp. */}
      <svg
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0 }}
        focusable="false"
      >
        <filter id="nook-liquid" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.016"
            numOctaves={2}
            seed={4}
            result="turb"
          >
            <animate
              attributeName="baseFrequency"
              dur="20s"
              values="0.012 0.016; 0.017 0.011; 0.012 0.016"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="turb"
            scale={36}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <motion.div
        ref={cardRef}
        onPointerMove={onMove}
        initial={{ opacity: 0, y: 30, scale: 0.96, filter: 'blur(14px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="liquid-glass w-full max-w-md p-8 sm:p-10"
      >
        <div className="liquid-glass__refract" />
        <div className="liquid-glass__specular" />

        <div className="relative z-[2]">
          <div className="mb-8 text-center">
            <h1 className="text-holo-gradient select-none text-5xl font-medium tracking-[0.06em]">
              nook
            </h1>
            <p className="mt-3 text-sm font-light tracking-[0.15em] text-holo-ice/55">
              {mode === 'signin' ? 'welcome back' : 'create your account'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="sr-only" htmlFor="email">
              email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@somewhere.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy || done}
              className="liquid-input"
            />

            <label className="sr-only" htmlFor="password">
              password
            </label>
            <div className="relative flex items-center">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? 'create a password (min 6 chars)' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy || done}
                className="liquid-input pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                disabled={busy || done}
                aria-label={showPw ? 'hide password' : 'show password'}
                className="absolute right-3 flex items-center justify-center text-holo-ice/40 transition hover:text-holo-ice/80 disabled:opacity-40"
              >
                {showPw ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {mode === 'signin' && (
              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={busy || done}
                  className="text-xs text-holo-ice/40 transition hover:text-holo-ice/70 disabled:opacity-50"
                >
                  forgot?
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {(error || notice) && (
                <motion.div
                  key={error || notice}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                    error
                      ? 'border-holo-pink/25 bg-holo-pink/10 text-holo-pink/90'
                      : 'border-holo-cyan/25 bg-holo-cyan/10 text-holo-cyan/90'
                  }`}
                >
                  {error || notice}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={busy || done}
              className="mt-2 rounded-xl bg-holo-ice/95 px-5 py-3 text-sm font-medium text-void transition hover:bg-white disabled:cursor-default disabled:opacity-80"
            >
              {done
                ? 'welcome back ✦'
                : busy
                  ? mode === 'signin'
                    ? 'signing in…'
                    : 'creating account…'
                  : mode === 'signin'
                    ? 'sign in'
                    : 'create account'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-holo-ice/30">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => oauth('google')}
              disabled={busy || done}
              className="rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-holo-ice/80 backdrop-blur-sm transition hover:bg-white/10 disabled:opacity-50"
            >
              google
            </button>
            <button
              type="button"
              onClick={() => oauth('github')}
              disabled={busy || done}
              className="rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-holo-ice/80 backdrop-blur-sm transition hover:bg-white/10 disabled:opacity-50"
            >
              github
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-holo-ice/35">
            {mode === 'signin' ? (
              <>
                new here?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-holo-ice/60 underline-offset-4 transition hover:text-holo-ice hover:underline"
                >
                  create an account
                </button>
              </>
            ) : (
              <>
                already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-holo-ice/60 underline-offset-4 transition hover:text-holo-ice hover:underline"
                >
                  sign in
                </button>
              </>
            )}
            {' · '}
            <Link
              href="/"
              className="text-holo-ice/60 underline-offset-4 transition hover:text-holo-ice hover:underline"
            >
              back home
            </Link>
          </p>
        </div>
      </motion.div>
    </>
  );
}
