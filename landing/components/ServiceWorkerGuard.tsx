'use client';

import { useEffect } from 'react';

/**
 * This landing app ships no service worker of its own. But it may be served on
 * the same origin (e.g. localhost:3000) where the main nook app previously
 * registered `/sw.js` for web push. That stale worker hijacks this app's
 * requests and 500s them.
 *
 * Since we never want a service worker on *this* origin, unregister any that's
 * present and drop its caches. This can't rescue the very first blocked load
 * (the worker fails the HTML before this runs — clear it once by hand), but it
 * keeps the origin clean on every load afterward. It only ever runs on the
 * origin this app is served from, so a main-app worker on a different port is
 * untouched.
 */
export default function ServiceWorkerGuard() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});

    if (typeof caches !== 'undefined') {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }, []);

  return null;
}
