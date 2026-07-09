import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import LiquidGlassLogin from '@/components/LiquidGlassLogin';

export const metadata: Metadata = {
  title: 'nook — sign in',
  description: 'sign in to nook.',
};

// Fixed violet ambient hue for the login — the glass caustics grade against it.
const hue = { '--ambient-hue': '272' } as CSSProperties;

export default function LoginPage() {
  return (
    <main
      style={hue}
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-6"
    >
      <div className="ambient-wash" />
      <div className="hero-glow" />
      <div className="relative z-10 w-full max-w-md">
        <LiquidGlassLogin />
      </div>
    </main>
  );
}
