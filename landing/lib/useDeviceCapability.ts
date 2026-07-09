'use client';

import { useEffect, useState } from 'react';

export type Capability = {
  /** Whether it's safe/worthwhile to mount the WebGL scene. */
  can3D: boolean;
  /** Resolved after mount; until then we render nothing 3D (SSR-safe). */
  ready: boolean;
  reducedMotion: boolean;
};

/**
 * Decide whether to serve the full 3D scene or a static gradient fallback.
 *
 * We bail out of 3D when:
 *  - the user asked for reduced motion,
 *  - WebGL isn't available,
 *  - the device looks low-end (few cores / little memory), or
 *  - it's a small touch device (phones get the fallback — the flex piece is a
 *    desktop experience, and mobile GPUs choke on transmission + bloom).
 */
export function useDeviceCapability(): Capability {
  const [cap, setCap] = useState<Capability>({
    can3D: false,
    ready: false,
    reducedMotion: false,
  });

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const hasWebGL = (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(
          window.WebGLRenderingContext &&
          (canvas.getContext('webgl2') || canvas.getContext('webgl'))
        );
      } catch {
        return false;
      }
    })();

    // navigator.deviceMemory / hardwareConcurrency are advisory and not on
    // every browser; treat "unknown" as capable.
    const cores = navigator.hardwareConcurrency ?? 8;
    const memory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory ?? 8;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 640;

    const lowEnd = cores <= 4 || memory <= 4;

    const can3D =
      hasWebGL && !reducedMotion && !lowEnd && !smallScreen;

    setCap({ can3D, ready: true, reducedMotion });
  }, []);

  return cap;
}
