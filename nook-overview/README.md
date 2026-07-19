# Nook — Complete Overview

This folder is the **full reference for the Nook app**. It is written so that
someone who has never seen the code can rebuild Nook from scratch, and so that
someone maintaining it understands every moving part and the reasons behind the
non-obvious decisions.

Nook is a **personal productivity workspace** — a single-page app that bundles
tasks, a calendar, habits, a journal, notes, focus timer, trackers/analytics,
reminders, a credential vault, links, countdowns, and an activity log into one
keyboard-driven interface. Its defining architectural choice: **all real user
data lives in the browser's `localStorage`**; there is no backend database for
your content. A small Supabase layer exists only for the handful of things a
client-only app physically cannot do (fire a reminder while the tab is closed,
prove identity, run scheduled Drive backups).

---

## How to read this

| Doc | What it covers |
|---|---|
| [01-architecture.md](01-architecture.md) | The core model: localStorage-as-truth, state in `App.jsx`, code-splitting, cross-tab behaviour, why Supabase is so narrow |
| [02-data-model.md](02-data-model.md) | **Every** localStorage key and the exact shape of every entity (tasks, habits, trackers, journal, notes, links, vault, countdowns, events, goals, intentions, settings, activity log) |
| [03-tabs-and-features.md](03-tabs-and-features.md) | The 14 tabs, what each owns, and per-tab quirks |
| [04-google-sync.md](04-google-sync.md) | Google Tasks + Google Calendar two-way sync in full detail |
| [05-backend.md](05-backend.md) | Supabase: auth, the 5 tables, RLS, the 4 edge functions, Web Push, Drive backup, migrations, all env vars |
| [06-ui-and-styling.md](06-ui-and-styling.md) | Theming, CSS conventions, the sidebar rail, icons, animation |
| [07-build-and-setup.md](07-build-and-setup.md) | Rebuild from zero: dependencies, env, scripts, PWA/service worker, deployment |
| [08-conventions-and-gotchas.md](08-conventions-and-gotchas.md) | The traps — things that are expensive to re-derive and easy to get wrong. Read before touching dates, storage keys, or the sync/backup files. |

---

## Tech stack at a glance

- **React 18.3** + **Vite 5** — plain JS/JSX, **no TypeScript**, no ESLint config, no test runner.
- **framer-motion** — page/tab transitions and micro-interactions.
- **chart.js** + **react-chartjs-2** — Reports charts.
- **@supabase/supabase-js** — auth + the 5 companion tables (optional; app runs fully without it).
- **canvas-confetti** (loaded from CDN in `index.html`), **html2canvas**, **jszip** — confetti, image export, journal `.docx` export.
- Scripts: `npm run dev | build | preview` — that is the entire script surface.

## Repo layout at a glance

```
index.html            App entry; registers /sw.js; loads confetti from CDN
vite.config.js        Vite config (also copies the favicon on build)
public/               PWA manifest, icons, sw.js (service worker for Web Push)
src/
  main.jsx            Mounts <ErrorBoundary><AuthGate><App/></AuthGate></ErrorBoundary>
  App.jsx             ~1750 lines. Holds most state; routes the 14 tabs.
  index.css           The entire stylesheet (~8500 lines).
  habitsStore.js      Habits data layer (nook_habits).
  components/         One file per view + shared widgets (see 03).
  utils/              Sync, auth, reminders, backup, dates, ids, activity log.
  trackers/           Reports/trackers data + analytics.
supabase/
  functions/          4 Deno edge functions (see 05).
  migrations/         SQL schema for the 5 tables.
landing/              SEPARATE Next.js marketing site — OFF-LIMITS for app changes.
```

> **`landing/` is a standalone Next.js marketing app.** It shares nothing with
> the SPA except an SSO token handoff (see [05-backend.md](05-backend.md)). Do not
> change app behaviour there.

---

## The one-paragraph mental model

`App.jsx` loads every localStorage-backed slice synchronously into React state on
mount, passes it down as props, and writes each slice back with a `useEffect` on
change. Each tab is a `lazy()`-loaded view. Cloud features are **additive** — if
Supabase is unconfigured or offline, every cloud helper early-returns and the app
is fully usable. That single rule (local-first, cloud-optional) explains almost
every design decision in the codebase.
