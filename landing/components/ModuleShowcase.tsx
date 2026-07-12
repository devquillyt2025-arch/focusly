'use client';

import type { PointerEvent } from 'react';
import { motion, type Variants } from 'framer-motion';
import AskNook from './AskNook';

type ModuleCard = {
  name: string;
  blurb: string;
  glyph: string;
};

const MODULES: ModuleCard[] = [
  { name: 'habits', blurb: 'streaks that compound quietly.', glyph: '◇' },
  { name: 'goals', blurb: 'outcomes, broken into moves.', glyph: '△' },
  { name: 'journal', blurb: 'a private, searchable mind.', glyph: '❍' },
  { name: 'tasks', blurb: 'what matters, surfaced today.', glyph: '▢' },
  { name: 'calendar', blurb: 'time you can actually see.', glyph: '◈' },
  { name: 'finance', blurb: 'money, without the spreadsheet.', glyph: '⬡' },
  { name: 'activity log', blurb: 'every action, remembered.', glyph: '◉' },
  { name: 'reports', blurb: 'your week, reflected back.', glyph: '▨' },
];

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const card: Variants = {
  hidden: { opacity: 0, y: 40, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Cursor physics for the glass cards: a gentle 3D tilt toward the pointer plus
 * a tracked specular highlight (--mx/--my feed .card-specular) — the login
 * card's living-glass feel, lightweight. Direct style writes, no state, no
 * re-renders; mouse only (touch scrolling must never fight a tilt).
 */
function onTiltMove(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 7).toFixed(
    2
  )}deg) rotateY(${((px - 0.5) * 9).toFixed(2)}deg) translateY(-4px)`;
}

function onTiltLeave(e: PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = '';
}

/** Specular-only variant for surfaces with inputs (no tilt while typing). */
function onSpecularMove(e: PointerEvent<HTMLDivElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

export default function ModuleShowcase() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 pt-8 sm:pt-16">
      <motion.header
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mb-16 text-center sm:mb-24"
      >
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.35em] text-holo-ice/40">
          the modules
        </p>
        <h2 className="text-holo-gradient mx-auto max-w-2xl text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          every module catches the light.
        </h2>
      </motion.header>

      <motion.ul
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-10%' }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {MODULES.map((m) => (
          <motion.li key={m.name} variants={card} className="h-full">
            {/* Tilt lives on this inner div so it never fights the entrance
                animation framer runs on the li. */}
            <div
              onPointerMove={onTiltMove}
              onPointerLeave={onTiltLeave}
              className="glass glass-sheen group relative flex h-full min-h-[180px] flex-col justify-between rounded-3xl p-6 will-change-transform"
            >
              <span className="card-specular" aria-hidden />
              <span
                className="text-3xl text-holo-ice/70 transition-colors group-hover:text-holo-ice"
                aria-hidden
              >
                {m.glyph}
              </span>
              <div>
                <h3 className="text-xl font-medium lowercase tracking-tight text-holo-ice">
                  {m.name}
                </h3>
                <p className="mt-1 text-sm font-light text-holo-ice/50">
                  {m.blurb}
                </p>
              </div>
            </div>
          </motion.li>
        ))}
      </motion.ul>

      {/* Live product-brain demo. */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mt-24 sm:mt-32"
      >
        <p className="mb-6 text-center text-sm font-light tracking-[0.2em] text-holo-ice/40">
          give it a task. watch nook think.
        </p>
        <div
          onPointerMove={onSpecularMove}
          className="group relative mx-auto w-full max-w-xl"
        >
          <span className="card-specular z-10 rounded-3xl" aria-hidden />
          <AskNook />
        </div>
      </motion.div>
    </section>
  );
}
