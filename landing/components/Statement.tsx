'use client';

import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';

const TEXT =
  'you keep your life in eight different apps. nook folds them into one surface of glass.';

/**
 * Pinned statement, revealed word by word as you scroll — the section is
 * taller than the viewport, the sentence sticks to center, and each word
 * fades in across the pinned range. Opacity/transform are MotionValues set
 * directly on style (no re-renders while scrubbing).
 */
function Word({
  word,
  progress,
  range,
}: {
  word: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.08, 1]);
  const y = useTransform(progress, range, [12, 0]);
  const isBrand = word === 'nook';
  return (
    <motion.span
      style={{ opacity, y }}
      className={`mr-[0.3em] inline-block ${
        isBrand ? 'text-holo-gradient font-medium' : ''
      }`}
    >
      {word}
    </motion.span>
  );
}

export default function Statement() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  const words = TEXT.split(' ');
  const step = 0.6 / words.length;

  return (
    <section ref={ref} className="relative z-10 h-[190dvh]">
      <div className="sticky top-0 flex h-[100svh] items-center justify-center px-6">
        <p className="max-w-4xl text-center text-3xl font-light leading-snug tracking-tight text-holo-ice sm:text-5xl md:text-6xl">
          {reduced
            ? TEXT
            : words.map((word, i) => {
                const start = 0.08 + i * step;
                return (
                  <Word
                    key={`${word}-${i}`}
                    word={word}
                    progress={scrollYProgress}
                    range={[start, Math.min(start + step * 2, 0.95)]}
                  />
                );
              })}
        </p>
      </div>
    </section>
  );
}
