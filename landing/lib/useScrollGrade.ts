'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { scrollStore, clamp } from './scroll';

/**
 * Smooth momentum scroll (Lenis) + scroll-scrubbed color grading, driven by a
 * single rAF loop.
 *
 * Two things made scrolling feel laggy before, both fixed here:
 *
 *  1. We wrote `--ambient-hue` every single frame. Every `.glass` element uses
 *     `backdrop-filter`, and any CSS-var change they reference forces those
 *     (expensive) backdrop layers to repaint — on every scroll frame. Now we
 *     only write the hue when its rounded value actually changes, so glass
 *     layers repaint a handful of times per second instead of 60+.
 *
 *  2. Native scroll had no inertia, so the stepped morph/grade read as jank.
 *     Lenis interpolates scroll position, so the object, the grade, and the
 *     page all move as one smooth system.
 *
 * `scrollStore` (read every frame by the R3F `useFrame`) still updates each
 * frame — that's just number assignment and triggers no layout/paint.
 */
export function useScrollGrade() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // Cool blue-violet → warm magenta-pink.
    const HUE_HERO = 244;
    const HUE_MODULES = 312;
    let lastHue = -1;

    const grade = () => {
      const scrollable = root.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? clamp(window.scrollY / scrollable) : 0;
      const heroProgress = clamp(window.scrollY / window.innerHeight);

      // Read every frame — cheap, no repaint. Feeds the 3D scene.
      scrollStore.progress = progress;
      scrollStore.heroProgress = heroProgress;

      // Smoothstep, then only write the CSS var on a real (rounded) change so
      // the backdrop-filter layers aren't repainted 60×/sec.
      const t = progress * progress * (3 - 2 * progress);
      const hue = Math.round((HUE_HERO + (HUE_MODULES - HUE_HERO) * t) * 2) / 2;
      if (hue !== lastHue) {
        root.style.setProperty('--ambient-hue', hue.toFixed(1));
        lastHue = hue;
      }
    };

    // Reduced motion: no smoothing, just grade against native scroll.
    if (reducedMotion) {
      let raf = 0;
      const loop = () => {
        grade();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    const lenis = new Lenis({
      duration: 1.15,
      // classic exponential ease-out — the buttery "portfolio scroll" curve
      easing: (x) => Math.min(1, 1.001 - Math.pow(2, -10 * x)),
      smoothWheel: true,
      touchMultiplier: 1.6,
      wheelMultiplier: 1,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      grade();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}
