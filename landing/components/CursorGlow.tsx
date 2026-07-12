'use client';

import { useEffect, useRef } from 'react';

/**
 * A soft, hue-tinted light that trails the cursor across the whole page —
 * the same trick the login card plays with its specular, scaled up. Every
 * glass surface reads as lit by the visitor.
 *
 * Perf: the element is fixed and moved with `transform: translate3d` from a
 * rAF lerp loop — compositor-only, zero layout/paint. Skipped entirely on
 * touch devices and for reduced-motion users.
 */
export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let tx = -600;
    let ty = -600;
    let x = tx;
    let y = ty;
    let seen = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) {
        // Snap on first movement so the glow doesn't sail in from offscreen.
        seen = true;
        x = tx;
        y = ty;
      }
    };

    const loop = () => {
      x += (tx - x) * 0.1;
      y += (ty - y) * 0.1;
      el.style.transform = `translate3d(${x - 260}px, ${y - 260}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className="cursor-glow" />;
}
