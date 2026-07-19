# 08 — Conventions & Gotchas

The expensive-to-re-derive, easy-to-get-wrong things. Read the relevant entry
before touching dates, storage keys, or the sync/backup files. None of these are
bugs to fix — each is a real decision with a real cost to "cleaning up".

---

## Dates: three anchoring conventions, all intentional

1. **Local-noon anchoring** — `new Date(ds + 'T12:00:00')` (no `Z`) is used almost
   everywhere (habits, trackers, journal, countdowns, analytics). At local midnight
   a `-1h` DST shift lands on the *previous* day; local noon never does. It's a DST
   guard, not an accident.
2. **Two different `todayStr()`** — `utils/date.js` returns the **local** date;
   `trackers/trackerUtils.js` returns the **UTC** date (`toISOString()`). The
   comment in `trackerUtils.js` says explicitly: *do not merge them.* Different call
   sites depend on the difference.
3. **Google Tasks payloads use midnight UTC** — the lone exception. See
   [04-google-sync.md](04-google-sync.md). **There is no noon-UTC anchoring
   anywhere**; if you read that somewhere, it's wrong.

## Storage keys: mixed hyphen/underscore is load-bearing

The `SK` map and the trackers store use **hyphens** (`nook-tasks`, `nook-settings`,
`nook-theme`, `nook-pomo-log`, `nook-intentions`, `nook-trackers`,
`nook-calendar-events`, `nook-activity-log`). Most feature modules use
**underscores** (`nook_notes`, `nook_links`, `nook_vault`, `nook_countdowns`,
`nook_habits`, `nook_journal_*`). **Renaming either family orphans real user
data.** Always grep the literal string before touching a key.

## Two id formats, on purpose

`utils/id.js → genId()` (base36 timestamp + random) for entities;
`utils/activityLog.js` uses a hyphenated `${Date.now()}-${rand}`. Not consolidated.

## Habits exist twice, on purpose

`nook_habits` (Habits tab + Today) and `type:'habit'` rows in `nook-trackers`
(Reports) are **separate stores** with different shapes (date-string array vs
`{date,value}` logs). A one-time `migrateFromTrackers()` (flag
`nook_habits_migrated`) *copied* — did not move — habit trackers into the habits
store, so the same habit can appear in both. Don't "dedupe" them without an
explicit product decision.

## The cross-tab banner has no dismiss — that's deliberate

Reload is the only exit. Verified with two real tabs: dismissing without reloading
leaves that tab's in-memory state stale, and its **next save silently overwrites**
whatever the other tab wrote — worse than no banner, because it teaches the user
the banner is safe to wave away. If a dismiss is ever reintroduced, it must
re-sync the tab's in-memory state from disk (at minimum for the changed key), not
just hide the UI. Don't "helpfully" re-add a `×`.

## Data-integrity files — refactor *around*, never *through*

Treat conflict-resolution / sync / auth logic in these as read-only unless the task
is explicitly to change that behaviour, and never auto-resolve conflicts in them:

- `utils/googleTasksSync.js`, `utils/googleCalendarSync.js`
- `utils/reminders.js`, `utils/notificationPrefs.js`, `utils/pushSubscription.js`
- `utils/backup.js`, `utils/driveBackup.js`, `utils/autoBackup.js`
- `utils/authClient.js`, `components/AuthGate.jsx`, `components/AuthPage.jsx`

Specifics that look like bugs but are correct:
- The **empty `else if (localUpdated > gUpdated) {}`** in `pullTasksFromGoogle` is
  intentional — it documents that local already-correct state wins and the queued
  push will carry it up. Don't delete it as dead code.
- **Never widen the Google Tasks pull allowlist** without deciding which Nook-only
  fields you'll lose (see [04-google-sync.md](04-google-sync.md)).
- Any **unlocked shared-key read-modify-write races across tabs** regardless of how
  simple the data model looks — add the `navigator.locks` mutex like the existing
  queues do.

## `FocusCompanion` is deliberately NOT `memo()`-wrapped

It derives `todayStr` from the wall clock at render. The midnight rollover in
`App.jsx` only calls `setIntentions`, which changes none of FocusCompanion's props
— so `memo()` would block the re-render and pin it to yesterday's pomodoro count
until an unrelated prop changed. The `useSyncExternalStore` tick hides this while a
timer runs, which is why it *looks* safe and isn't.

## Chart.js is registered twice, harmlessly

`AnalyticsDashboard` and `TrackerCharts.jsx` each call `ChartJS.register(...)`.
`register()` is idempotent, so the overlap is harmless. Don't collapse them into a
single shared registration point (that regression previously made
`AnalyticsDashboard` work only by import-order luck).

## Timer tick is an external store, not App state

The 1s tick lives in `utils/timerTickStore.js` and is read via
`useSyncExternalStore`, specifically so ticking re-renders only
`Timer`/`FocusCompanion`/`DailyGoalsView` and not the whole app. Don't route the
tick through `App.jsx` state. The countdown is derived from a `timerEndAt`
wall-clock delta (not accumulated intervals) so background-tab throttling can't
drift it.

## Activity log is write-only from the app

`logActivity()` writes `nook-activity-log` and fires a `nook-activity-updated`
window event. `ActivityLogView` owns all reads (live-reload throttled to 1.5s).
**Don't route the activity log through App state.**

## Journal is one key per day

`nook_journal_<YYYY-MM-DD>` — anything enumerating entries must scan localStorage
keys by the `nook_journal_` prefix, not read a single array.

## Deliberately-kept dead-ish code

- **`trackers/insightsEngine.js` (~143 ln) is fully orphaned** — its only importer
  (an unused `getDailyInsight` in `DailyGoalsView`) was removed. Left in place
  because deleting a whole module is a product decision.
- **`TaskList`'s `showTimePicker` state is permanently `false`** (only ever set to
  false; `timePickerRef` is attached to nothing). Removing it touches a `useState`
  and a `useEffect` dep array — out of scope for zero-behaviour passes.

## Verification discipline

- **`vite build` passing is not verification** — no TS, no lint; it will build a
  render-time `ReferenceError`. Drive the real app.
- To run gate-free, point Vite's `envDir` at a dir with an empty `.env`. Don't edit
  the real `.env.local`.
- **`landing/` is off-limits** for app changes.
- Commit per tab; never force-push; never auto-resolve conflicts in the
  data-integrity files above.
