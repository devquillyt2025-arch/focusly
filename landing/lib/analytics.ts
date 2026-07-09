'use client';

/**
 * Featherweight engagement telemetry.
 *
 * The whole point of this page is to hold attention long enough for the 3D to
 * land. So the one number worth measuring is: did people stay past ~8 seconds,
 * and how deep did they scroll? We fire a handful of events via `sendBeacon`
 * (survives page unload) to /api/analytics, which just logs them. Swap that
 * route for a real sink (PostHog, Plausible, a warehouse) when you want.
 */

type AnalyticsEvent =
  | { type: 'page_view'; ts: number }
  | { type: 'scroll_depth'; depth: number; ts: number }
  | { type: 'dwell'; seconds: number; ts: number }
  | { type: 'held_past_8s'; ts: number }
  | { type: 'easter_egg'; ts: number }
  | { type: 'ask_nook'; ts: number };

function send(event: AnalyticsEvent) {
  try {
    const body = JSON.stringify(event);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', body);
    } else {
      fetch('/api/analytics', { method: 'POST', body, keepalive: true });
    }
  } catch {
    /* analytics must never break the page */
  }
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[nook:analytics]', event);
  }
}

export function track(
  type: 'easter_egg' | 'ask_nook'
): void {
  send({ type, ts: Date.now() } as AnalyticsEvent);
}

/**
 * Wires up dwell-time + scroll-depth tracking. Call once, on mount, and invoke
 * the returned cleanup on unmount.
 */
export function initEngagementTracking(): () => void {
  const start = Date.now();
  const seenDepths = new Set<number>();
  const milestones = [25, 50, 75, 100];
  let held8 = false;

  send({ type: 'page_view', ts: start });

  const held8Timer = window.setTimeout(() => {
    held8 = true;
    send({ type: 'held_past_8s', ts: Date.now() });
  }, 8000);

  const onScroll = () => {
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    for (const m of milestones) {
      if (pct >= m && !seenDepths.has(m)) {
        seenDepths.add(m);
        send({ type: 'scroll_depth', depth: m, ts: Date.now() });
      }
    }
  };

  const flushDwell = () => {
    const seconds = Math.round((Date.now() - start) / 1000);
    send({ type: 'dwell', seconds, ts: Date.now() });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', flushDwell);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDwell();
  });

  return () => {
    window.clearTimeout(held8Timer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pagehide', flushDwell);
    if (!held8) {
      /* no-op; kept for symmetry / future use */
    }
  };
}
