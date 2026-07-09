import { Fragment } from 'react';

const ITEMS = [
  'habits',
  'goals',
  'journal',
  'tasks',
  'calendar',
  'finance',
  'activity log',
  'reports',
];

/**
 * Slow module-name ticker at the hero/statement boundary. Two identical rows
 * in a max-content track animated -50% → seamless loop; edges fade via mask.
 * Pure CSS animation on transform — compositor-only.
 */
export default function Marquee() {
  return (
    <div
      aria-hidden
      className="marquee relative z-10 select-none overflow-hidden border-y border-white/5 py-5"
    >
      <div className="marquee__track">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex shrink-0 items-center">
            {ITEMS.map((item) => (
              <Fragment key={item}>
                <span className="mx-8 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.4em] text-holo-ice/25">
                  {item}
                </span>
                <span className="text-[10px] text-holo-ice/15">✦</span>
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
