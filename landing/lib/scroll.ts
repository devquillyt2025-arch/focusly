/**
 * A single source of truth for scroll progress, shared between the DOM
 * (Framer Motion / CSS custom properties) and the R3F render loop.
 *
 * We deliberately keep this as a plain mutable singleton rather than React
 * state: the 3D scene reads it every frame inside `useFrame`, and triggering a
 * React re-render on every scroll event would be wasteful and janky. Components
 * that need to *render* from scroll (color grading) use the hook below, which
 * writes CSS variables instead of setting state.
 */
export const scrollStore = {
  /** 0 → 1 across the entire scrollable page. */
  progress: 0,
  /** 0 → 1 across just the hero (first viewport). Drives the object morph. */
  heroProgress: 0,
};

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Clamp to [min, max]. */
export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));
