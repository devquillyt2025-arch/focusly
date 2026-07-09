import type { Config } from 'tailwindcss';

/** Nook holographic palette — used by the liquid-glass login. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // near-black canvas
        void: '#050505',
        'void-soft': '#0a0a0f',
        holo: {
          indigo: '#6366f1',
          violet: '#8b5cf6',
          blue: '#38bdf8',
          cyan: '#22d3ee',
          pink: '#ec4899',
          magenta: '#d946ef',
          ice: '#e0e7ff',
        },
      },
      fontFamily: {
        // wired up via next/font (geist) in app/layout.tsx
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
