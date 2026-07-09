'use client';

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

export default function ModuleShowcase() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-40 pt-24 sm:pt-40">
      <motion.header
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mb-16 text-center sm:mb-24"
      >
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.35em] text-holo-ice/40">
          one surface
        </p>
        <h2 className="text-holo-gradient mx-auto max-w-2xl text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          everything you keep, refracted through one place.
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
          <motion.li
            key={m.name}
            variants={card}
            whileHover={{ y: -6 }}
            className="glass glass-sheen group flex min-h-[180px] flex-col justify-between rounded-3xl p-6"
          >
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
        <AskNook />
      </motion.div>

      <footer className="mt-32 text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-holo-ice/30">
          nook · built to be looked at · triple-click the object
        </p>
      </footer>
    </section>
  );
}
