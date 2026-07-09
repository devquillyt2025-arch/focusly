'use client';

import { useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

/**
 * Liquid-glass login card. Non-functional by design — this is a portfolio
 * showcase, not real auth (nothing is sent anywhere). The look is the point:
 *
 *  - an animated SVG turbulence + displacement filter (#nook-liquid) warps the
 *    colored caustics behind the glass into a slow liquid ripple,
 *  - a cursor-tracked specular highlight makes it catch light like real glass,
 *  - a moving edge sheen keeps the surface alive.
 */
export default function LiquidGlassLogin() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || done || !email.trim() || !password.trim()) return;
    setBusy(true);
    // No backend — just a tasteful confirmation beat.
    window.setTimeout(() => {
      setBusy(false);
      setDone(true);
    }, 1100);
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
              welcome back
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
              className="liquid-input"
            />

            <label className="sr-only" htmlFor="password">
              password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="liquid-input"
            />

            <div className="-mt-1 flex justify-end">
              <button
                type="button"
                className="text-xs text-holo-ice/40 transition hover:text-holo-ice/70"
              >
                forgot?
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || done}
              className="mt-2 rounded-xl bg-holo-ice/95 px-5 py-3 text-sm font-medium text-void transition hover:bg-white disabled:cursor-default disabled:opacity-80"
            >
              {done ? 'welcome back ✦' : busy ? 'signing in…' : 'sign in'}
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
              className="rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-holo-ice/80 backdrop-blur-sm transition hover:bg-white/10"
            >
              google
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-holo-ice/80 backdrop-blur-sm transition hover:bg-white/10"
            >
              github
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-holo-ice/35">
            demo — nothing is sent.{' '}
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
