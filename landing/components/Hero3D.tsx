'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useDeviceCapability } from '@/lib/useDeviceCapability';
import Fallback from './Fallback';

// Lazy-load the WebGL canvas: never rendered on the server, only fetched when
// we've decided the device can handle it.
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => <SceneLoading />,
});

function SceneLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-16 w-16 animate-spin rounded-full border-2 border-holo-indigo/30 border-t-holo-ice/80" />
    </div>
  );
}

export default function Hero3D() {
  const { can3D, ready } = useDeviceCapability();

  return (
    <section className="relative flex h-[100svh] w-full items-center justify-center">
      {/* Soft radial glow behind the object. */}
      <div className="hero-glow" />

      {/* The centerpiece: 3D when capable, static gradient otherwise. */}
      <div className="absolute inset-0">
        {!ready ? null : can3D ? <Scene /> : <Fallback />}
      </div>

      {/* Wordmark + tagline, layered over the object. */}
      <div className="pointer-events-none relative z-10 flex flex-col items-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="text-holo-gradient select-none text-[22vw] font-medium leading-none tracking-[0.08em] sm:text-[18vw] md:text-[15rem]"
          style={{ mixBlendMode: 'plus-lighter' }}
        >
          nook
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.8 }}
          className="mt-6 max-w-xs text-sm font-light tracking-[0.35em] text-holo-ice/60 sm:text-base"
        >
          A QUIET PLACE FOR EVERYTHING
        </motion.p>
      </div>

      {/* Scroll cue. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, delay: 1.6 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-xs tracking-[0.3em] text-holo-ice/40"
      >
        SCROLL
      </motion.div>
    </section>
  );
}
