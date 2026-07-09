'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Hero3D from '@/components/Hero3D';
import Marquee from '@/components/Marquee';
import Statement from '@/components/Statement';
import ModuleShowcase from '@/components/ModuleShowcase';
import Finale from '@/components/Finale';
import CursorGlow from '@/components/CursorGlow';
import { useScrollGrade } from '@/lib/useScrollGrade';
import { initEngagementTracking } from '@/lib/analytics';

export default function Page() {
  // Owns the scroll → CSS-var + scrollStore loop (drives DOM + 3D as one).
  useScrollGrade();

  // Dwell-time / scroll-depth telemetry: does the 3D hold attention past 8s?
  useEffect(() => initEngagementTracking(), []);

  return (
    <main className="relative">
      {/* Atmosphere: hue wash (z-0) → cursor light (z-20) → vignette (z-25)
          → grain (z-50). All fixed, all compositor-cheap, none interactive. */}
      <div className="ambient-wash" />
      <CursorGlow />
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />

      {/* Discreet sign-in entry → liquid-glass login. */}
      <nav className="fixed right-5 top-5 z-30 sm:right-8 sm:top-8">
        <Link
          href="/login"
          className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs tracking-[0.2em] text-holo-ice/60 backdrop-blur-md transition hover:border-white/25 hover:text-holo-ice"
        >
          sign in
        </Link>
      </nav>

      <Hero3D />
      <Marquee />
      <Statement />
      <ModuleShowcase />
      <Finale />
    </main>
  );
}
