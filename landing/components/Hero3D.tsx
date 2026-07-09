'use client';

import dynamic from 'next/dynamic';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useDeviceCapability } from '@/lib/useDeviceCapability';
import Fallback from './Fallback';

// Lazy-load the WebGL canvas: never rendered on the server, only fetched when
// we've decided the device can handle it.
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => <SceneLoading />,
});

const LETTERS = ['n', 'o', 'o', 'k'];

function SceneLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-16 w-16 animate-spin rounded-full border-2 border-holo-indigo/30 border-t-holo-ice/80" />
    </div>
  );
}

export default function Hero3D() {
  const { can3D, ready } = useDeviceCapability();

  // Scroll-out parallax: as you leave the hero, the type drifts up, swells
  // slightly, and dissolves — the object (which grows via scrollStore in the
  // 3D scene) takes over the frame. MotionValues, so no re-renders.
  const { scrollY } = useScroll();
  const textY = useTransform(scrollY, [0, 640], [0, -150]);
  const textOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const textScale = useTransform(scrollY, [0, 640], [1, 1.07]);
  const cueOpacity = useTransform(scrollY, [0, 200], [1, 0]);

  return (
    <section className="relative flex h-[100svh] w-full items-center justify-center">
      {/* Soft radial glow behind the object. */}
      <div className="hero-glow" />

      {/* The centerpiece: 3D when capable, static gradient otherwise. */}
      <div className="absolute inset-0">
        {!ready ? null : can3D ? <Scene /> : <Fallback />}
      </div>

      {/* Wordmark + tagline, layered over the object. */}
      <motion.div
        style={{ y: textY, opacity: textOpacity, scale: textScale }}
        className="pointer-events-none relative z-10 flex flex-col items-center text-center"
      >
        <h1
          className="select-none text-[22vw] font-medium leading-none tracking-[0.08em] sm:text-[18vw] md:text-[15rem]"
          style={{ mixBlendMode: 'plus-lighter' }}
        >
          {/* Per-letter reveal. The gradient lives on each span (not the h1):
              transformed children break parent background-clip:text. */}
          {LETTERS.map((ch, i) => (
            <motion.span
              key={i}
              className="text-holo-gradient inline-block"
              initial={{ opacity: 0, y: '0.4em', scale: 1.12, filter: 'blur(18px)' }}
              animate={{ opacity: 1, y: '0em', scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 + i * 0.11 }}
            >
              {ch}
            </motion.span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 1.05 }}
          className="mt-6 max-w-xs text-sm font-light tracking-[0.35em] text-holo-ice/60 sm:text-base"
        >
          A QUIET PLACE FOR EVERYTHING
        </motion.p>
      </motion.div>

      {/* Scroll cue — fades as soon as scrolling starts. */}
      <motion.div
        style={{ opacity: cueOpacity }}
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3"
      >
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.9, duration: 1 }}
          className="text-[10px] tracking-[0.35em] text-holo-ice/40"
        >
          SCROLL
        </motion.span>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.9, duration: 1 }}
          className="scroll-line"
          aria-hidden
        />
      </motion.div>
    </section>
  );
}
