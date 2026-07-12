import type { Config } from 'tailwindcss';

/**
 * Nook holographic palette.
 * Cool indigo/violet at the hero, warming to holographic pink/magenta by the
 * module section — the same arc the 3D object and the scroll color-grade follow.
 */
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
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.06)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 8s ease-in-out infinite',
        'fade-up': 'fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
