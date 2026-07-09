'use client';

/**
 * Static gradient stand-in for the 3D scene. Served to reduced-motion users,
 * low-end devices, small screens, and anything without WebGL. It apes the
 * refractive form with layered conic/radial gradients and a slow CSS pulse —
 * no canvas, no draw calls.
 */
export default function Fallback() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <div
        className="animate-glow-pulse motion-reduce:animate-none"
        style={{
          width: '58vmin',
          height: '58vmin',
          borderRadius: '48% 52% 60% 40% / 55% 45% 55% 45%',
          background:
            'conic-gradient(from 200deg at 50% 50%, hsla(var(--ambient-hue),90%,65%,0.9), hsla(calc(var(--ambient-hue) + 50),90%,68%,0.85), hsla(calc(var(--ambient-hue) - 30),85%,60%,0.85), hsla(var(--ambient-hue),90%,65%,0.9))',
          filter: 'blur(6px) saturate(1.2)',
          boxShadow:
            '0 0 120px 20px hsla(var(--ambient-hue),90%,60%,0.35), inset 0 0 80px hsla(var(--ambient-hue),90%,85%,0.4)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Highlight sheen so it reads as glass, not a flat blob. */}
      <div
        className="absolute"
        style={{
          width: '58vmin',
          height: '58vmin',
          borderRadius: '48% 52% 60% 40% / 55% 45% 55% 45%',
          background:
            'radial-gradient(40% 30% at 38% 30%, rgba(255,255,255,0.55), transparent 60%)',
          filter: 'blur(4px)',
        }}
      />
    </div>
  );
}
