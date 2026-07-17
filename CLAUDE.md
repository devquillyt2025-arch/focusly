# CLAUDE.md — Nook

Read this first. It documents the things that are expensive to re-derive from the
code and easy to get wrong. It is deliberately not a file-by-file tour — the code
is readable; the traps are not.

**Stack:** React 18 + Vite 5, plain JS/JSX (no TypeScript), framer-motion,
chart.js via react-chartjs-2, Supabase JS client. No test runner, no ESLint config.
`npm run dev | build | preview` are the only scripts.

**`landing/` is a separate Next.js marketing app. It is off-limits for app changes.**
Everything below describes the SPA in `src/`.

---

## 1. Architecture: localStorage is the source of truth

Nook is a **client-only SPA with no backend of its own.** Every feature's primary
data lives in `localStorage`, is loaded synchronously into React state in
`App.jsx`, and is written back by a `useEffect` on change. There is no server
round-trip for normal reads/writes, and the app is fully functional with no
network and no account.

Two consequences that drive most of the design:

- **State lives in `App.jsx`** (~2050 lines) and flows down as props. Views are
  code-split with `lazy()` per tab, but they are not independently stateful stores.
- **Anything cloud-backed is an *addition* to localStorage, never a replacement.**
  If the cloud is unconfigured or offline, the app must still work.

### Supabase scope — and why it is this narrow

Supabase is used **only where a client-only app physically cannot do the job**:
something must run while the browser is closed, or identity must be proven.
It is *not* a general sync layer, and task/note/journal/habit data is never
stored there.

Five tables, and nothing else:

| Table | Written by | Why it can't be local |
|---|---|---|
| `reminders` | `utils/reminders.js` | An Edge Function must fire the reminder while the tab is shut |
| `notification_prefs` | `utils/notificationPrefs.js` | The same server-side sender needs to read prefs |
| `push_subscriptions` | `utils/pushSubscription.js` | Web Push endpoints are per-device and server-delivered |
| `drive_backup` | `utils/driveBackup.js`, `utils/autoBackup.js` | Holds Drive OAuth state for scheduled backups |
| `backup_runs` | `utils/driveBackup.js` | Audit trail of backup runs |

Edge functions live in `supabase/functions/` (`send-task-reminders`,
`drive-backup`, `connect-drive`); migrations in `supabase/migrations/`.

**Auth is optional by design.** `utils/authClient.js` sets
`isAuthConfigured = Boolean(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)`. When
false, `AuthGate` renders the app with **no login gate at all** and every
Supabase-backed helper early-returns. Never write code that assumes a session
exists. RLS scopes all queries to the signed-in user, so reads don't filter on
`user_id` explicitly.

`AuthGate` also consumes a cross-origin SSO handoff from the `landing/` app via
`#sb_access_token=...`/`sb_refresh_token=...`, then scrubs the hash. Those custom
key names exist so they don't collide with Supabase's own OAuth/magic-link hash
format, which `detectSessionInUrl` handles natively. Don't rename them on one
side only.

---

## 2. Google Tasks sync (`utils/googleTasksSync.js`)

The single most intricate file in the repo. **Tasks only** — habits, goals,
journal and trackers are untouched by it.

### Auth
PKCE OAuth against `https://www.googleapis.com/auth/tasks`, `prompt=consent` to
force a refresh token. Tokens land in `localStorage.nook_google_tokens`
(`accessToken`/`refreshToken`/`expiresAt`); `getValidAccessToken()` refreshes when
under 60s of life remains, and calls `disconnectGoogleTasks()` on a failed refresh.

### Date anchoring — read this before touching dates
There are **two different conventions**, and they are not interchangeable:

- **Google Tasks payloads use midnight UTC.** `nookToGoogleTask()` writes
  date-only dues as `` `${task.dueDate}T00:00:00.000Z` ``. `extractDueDateTime()`
  round-trips it by special-casing exactly that suffix and taking `split('T')[0]`,
  which is what keeps a date-only task from drifting a day. A task *with* a time
  is converted local→UTC via `toISOString()` and back via local getters.
- **Everything else in the app anchors date strings at *local noon***
  (`new Date(ds + 'T12:00:00')`, no `Z`) — see `habitsStore`, `trackerUtils`,
  `analyticsUtils`, Journal, Habits, Countdowns. This is a DST/timezone guard: at
  local midnight a `-1h` DST shift lands on the previous day; local noon never does.

There is **no noon-UTC anchoring anywhere.** If you read that somewhere, it is wrong.

Related trap: `trackers/trackerUtils.js` exports a **UTC-based** `todayStr()`
(`toISOString()`), while `utils/date.js` exports a **local-date** `todayStr()`.
The comment at `trackerUtils.js:45` says explicitly: *do not merge them.* They
have different call sites that depend on the difference.

### Field ownership (the allowlist)
On pull, a remote task **only overwrites this allowlist**:

```
name, notes, dueDate, time, completed, status, completedAt, lastSyncedAt, updatedAt
```

Everything else survives via `...t` because Google Tasks has no concept of it:
`category`, `priority`, `timeEstimate`, `timeLogged`, `pomodorosCompleted`,
`recurrence`, `recurrenceDays`, `subtasks`, `id`. **Widening this allowlist will
silently destroy Nook-only data on the next pull.**

### Conflict resolution — last-write-wins
Google wins only when it is newer than *both* the last sync and the local edit:

```js
if (gUpdated > localSynced && gUpdated > localUpdated) { /* apply remote */ }
else if (localUpdated > gUpdated) { /* local wins: intentionally a no-op */ }
```

The empty `else if` is **deliberate** — local state is already correct, and the
queued push will carry it up. Deletes resolve the same way: a task deleted on
Google but edited locally is kept and tagged `syncConflict` rather than removed.

### Orchestration
`syncTasks()` = push queue → pull, in that order, guarded by a `syncInProgress`
flag and a 30s debounce on window-focus triggers. `pushSyncQueue()` collapses
repeat ops per task; deleted Google IDs are tombstoned in `nook_deleted_tasks` so
a pull can't resurrect them. 429s are re-queued; 100ms is slept between requests.

`syncTaskField()` is a separate immediate single-field PATCH used by the
Scheduling tab for instant feedback, bypassing the queue. It returns a tagged
result (`unauthenticated` / `no_google_id` / `api_error` / `network_error`).

### Known limitations (documented in-file, don't "fix" accidentally)
- **Single-device.** All sync state is localStorage; opening Nook elsewhere will
  not see prior sync state and can duplicate.
- **Recurrence is local-only.** The Google Tasks REST API has no recurrence field;
  any RRULE is silently dropped. Nook creates the next occurrence itself.
- **Supabase auth requirement.** The Google OAuth token exchange and refresh are handled server-side by the `google-oauth` Edge Function (to keep the `GOOGLE_CLIENT_SECRET` out of the client bundle). This means Tasks and Calendar integrations require Supabase to be configured and the user to be signed in to perform sync operations.

---

## 3. The 14 tabs

Tab ids come from `App.jsx` (`allTabs`, ~line 1270). id → label is not 1:1 —
`daily`→"Today", `vault`→"Saved Logins", `timer`→"Focus Timer".

| id | Label | Owns | Key files | Storage |
|---|---|---|---|---|
| `daily` | Today | Day dashboard, intentions, at-a-glance goals | `DailyGoalsView`, `DailyIntentions` (rendered by App, not the view) | `nook-intentions`, `nook_goals` |
| `tasks` | Tasks | Tasks, subtasks, scheduling, Google sync entry | `TaskList` (1668 ln), `AddTaskModal`, `ReminderField` | `nook-tasks`, `nook_task_sort`, `nook_custom_categories` |
| `notes` | Notes | Rich-text notes + `NoteModal` | `NotesView` | `nook_notes` |
| `calendar` | Calendar | Month grid, custom events, Google Calendar | `CalendarView`, `utils/googleCalendarSync.js` | `nook-calendar-events`, `nook_gcal_*` |
| `reminders` | Reminders | Supabase-backed reminders (see §4) | `RemindersView`, `utils/reminders.js` | Supabase only |
| `vault` | Saved Logins | Credential vault | `VaultView` | `nook_vault` |
| `links` | Links | Bookmarks + categories | `LinksView` | `nook_links` |
| `countdowns` | Countdowns | Date countdowns, pinning | `CountdownsView` | `nook_countdowns`, `nook_countdown_pinned` |
| `habits` | Habits | Standalone habit tracking (see §5) | `HabitsView`, `habitsStore.js` | `nook_habits`, `nook_habits_migrated` |
| `timer` | Focus Timer | Pomodoro + focus companion | `Timer`, `FocusCompanion`, `utils/timerTickStore.js` | `nook-pomo-log` (falls back to legacy `nook-analytics`) |
| `journal` | Journal | Per-day entries, week/month calendar | `JournalView` | `nook_journal_<YYYY-MM-DD>` (per-entry), `nook_journal_icons`, `nook_journal_calview`, `nook_journal_calcollapsed` |
| `reports` | Reports | Trackers + analytics + charts | `ReportsView`, `trackers/*`, `AnalyticsDashboard`, `TrackerCharts` | `nook-trackers` |
| `activity` | Activity Log | Cross-module audit trail | `ActivityLogView`, `utils/activityLog.js` | `nook-activity-log` |
| `settings` | Settings | Profile, theme, notifications, backup, integrations | `SettingsView`, `utils/backup.js`, `driveBackup.js` | `nook-settings`, `nook-profile-*`, `nook-notif-*`, `nook-theme` |

### Tab-specific quirks worth knowing

- **Timer:** the 1s tick is an external store (`utils/timerTickStore.js`) read via
  `useSyncExternalStore`, *specifically* so ticking re-renders only `Timer`/
  `FocusCompanion`/`DailyGoalsView` and not the whole app. Don't route the tick
  through App state. Countdown is derived from a `timerEndAt` wall-clock delta,
  not from accumulated intervals, so background-tab throttling can't drift it.
- **FocusCompanion** reads `localDateStr()` at render time and is deliberately
  **not** wrapped in `memo()` — see §6.
- **Reminders:** the only tab that is a pure Supabase read/write with no local
  mirror. Empty when `isAuthConfigured` is false.
- **Journal:** one localStorage key *per day* (`nook_journal_<date>` prefix), not
  one array. Anything enumerating entries must scan keys by prefix.
- **Reports:** `AnalyticsDashboard` and `TrackerCharts.jsx` each call
  `ChartJS.register(...)` independently (fixed in `9fe9afa` — previously only
  `TrackerCharts.jsx` registered, and `AnalyticsDashboard` worked only by import-order
  luck). `register()` is idempotent, so the overlap between the two files' element
  sets is harmless; don't re-introduce a single shared registration point.

---

## 4. Data-integrity files — refactor *around*, never *through*

Treat the conflict-resolution / sync / auth logic in these as read-only unless the
task is explicitly to change behavior, and never auto-resolve conflicts in them:

- `utils/googleTasksSync.js` (push/pull, allowlist, last-write-wins, tombstones)
- `utils/reminders.js`, `utils/notificationPrefs.js`, `utils/pushSubscription.js`
- `utils/backup.js`, `utils/driveBackup.js`, `utils/autoBackup.js`
- `utils/authClient.js`, `components/AuthGate.jsx`, `components/AuthPage.jsx`

Backup note: reminders/notification prefs are re-fetched from Supabase on export
and are intentionally **not** carried between devices on import (they're tied to
per-device/per-user rows).

---

## 5. Habits exist twice, on purpose

There are two habit systems and they are **not** the same store:

- `habitsStore.js` → `nook_habits`. Powers the **Habits** tab and Today.
  Completions are a plain array of date strings.
- `trackers/trackerUtils.js` → `nook-trackers`. Powers **Reports**, with four
  types: `habit`, `target`, `average`, `project`. Logs are `{date, value}` objects.

`migrateFromTrackers()` ran once (flagged by `nook_habits_migrated`) and **copied**
`type: 'habit'` trackers into the habits store. It did not delete them — so the
same habit can legitimately appear in both Habits and Reports. Do not "dedupe"
these into one store without an explicit decision; the shapes and semantics differ.

---

## 6. Conventions actually observed in this code

Match these; do not "improve" them.

- **localStorage key naming is inconsistent and load-bearing.** The `SK` map in
  `App.jsx` and the trackers store use **hyphens** (`nook-tasks`, `nook-settings`,
  `nook-theme`, `nook-pomo-log`, `nook-intentions`, `nook-trackers`,
  `nook-calendar-events`, `nook-activity-log`). Most feature modules use
  **underscores** (`nook_notes`, `nook_links`, `nook_vault`, `nook_countdowns`,
  `nook_habits`, `nook_journal_*`). **Renaming either family orphans real user
  data.** Always grep the literal before touching a key.
- **Terse style.** Aligned `const` blocks, single-line guards, `try {} catch {}`
  around every localStorage access, `?.`/`??` over defensive `if`s.
- **Inline `style={{}}` is the norm**, alongside CSS classes. Repeated inline
  style objects are idiomatic here — do not hoist them into shared constants.
- **Icons are local `function IcoX()` / `NavIcoX()` components** returning inline
  SVG, with a shared `const S`/`SI` spread props object per file. Duplication of
  that object across files is accepted.
- **Route-level views are `lazy()`-loaded** in `App.jsx`, one chunk per tab.
- **Commits:** `type(scope): lowercase imperative summary`, scope is the tab
  (`tasks`, `journal`, `activity-log`, `reports`, `daily`, `shared`).
- JSX uses the automatic runtime — no file imports `React` directly.

---

## 7. Hard constraints

- **Stop before each commit.** One commit per tab, so a bad change is bisectable.
- **Never force push.** Never auto-resolve conflicts in the §4 files.
- **`vite build` passing is not sufficient verification.** It type-checks nothing
  (no TS, no lint) and will happily build a `ReferenceError` that throws on
  render — this exact class of bug shipped in `HabitDetail`. Verify by driving the
  real app.
  - To run it without a login gate, point Vite's `envDir` at a directory holding
    an empty `.env` so `VITE_SUPABASE_*` are absent and `AuthGate` passes through.
    Do **not** edit or move the real `.env.local`.
- **`landing/` is off-limits** for app changes.
- **Never widen the Google Tasks pull allowlist** (§2) without deciding what
  Nook-only fields you're willing to lose.

---

## 8. Known issues, intentionally left uncleaned

Recorded so future sessions don't re-flag them as new findings. None of these are
dead code; each is a real decision or a real bug with a real cost to touching.

**Dead-ish code deliberately kept:**

- **`trackers/insightsEngine.js` (143 ln) is fully orphaned.** Its only importer
  was an unused `getDailyInsight` import in `DailyGoalsView`, removed in `92722ca`.
  Nothing imports it now. Left in place because deleting a whole module is a
  product decision, not a cleanup.
- **`TaskList`'s `showTimePicker` state is permanently `false`.** It is only ever
  set to `false` (never `true`), and `timePickerRef` is attached to no element, so
  the outside-click branch is unreachable. Removing it touches a `useState` and a
  `useEffect` dep array — deliberately out of scope for zero-behavior passes.
- **The empty `else if (localUpdated > gUpdated) {}`** in `pullTasksFromGoogle` is
  intentional (§2). Don't delete it as dead code; it documents the branch.

**Do not "fix" these — they are correct:**

- Two `todayStr()` implementations (UTC in `trackerUtils`, local in `utils/date`).
- Local-noon date anchoring everywhere except Google Tasks payloads (§2).
- Mixed hyphen/underscore localStorage keys (§6).
- `FocusCompanion` is not `memo()`-wrapped. It derives `todayStr` from the wall
  clock at render. The midnight rollover in `App.jsx` only calls `setIntentions`,
  which changes none of FocusCompanion's props — so `memo()` would block the
  re-render and pin it to yesterday's pomodoro count until an unrelated prop
  changed. The `useSyncExternalStore` tick hides this while a timer runs, which is
  why it looks safe and isn't.
