# 02 — Data Model & Storage

This is the exhaustive reference for **what Nook stores and where.** If you
rebuild the app, matching these keys and shapes gives you data compatibility.

> **Key-naming is inconsistent and load-bearing.** Some keys use **hyphens**
> (`nook-tasks`), most feature modules use **underscores** (`nook_notes`). This is
> historical and must not be "cleaned up" — renaming a key orphans real user data.
> Always grep the literal string before touching a key.

---

## Every localStorage key

### App-owned content (loaded into `App.jsx` state)

| Key | Shape | Owner |
|---|---|---|
| `nook-tasks` | `Task[]` | `App.jsx` |
| `nook-settings` | Pomodoro settings object | `App.jsx` |
| `nook-theme` | `'dark' \| 'light'` (string) | `App.jsx` |
| `nook-pomo-log` | `PomoEntry[]` (falls back to legacy `nook-analytics`) | `App.jsx` |
| `nook-intentions` | `{ date, items[], history{} }` | `App.jsx` |

### Feature-module content (module reads/writes its own key)

| Key | Shape | Owner |
|---|---|---|
| `nook_notes` | `Note[]` | `NotesView` |
| `nook_links` | `Link[]` (+ categories) | `LinksView` |
| `nook_vault` | `VaultEntry[]` | `VaultView` |
| `nook_countdowns` | `Countdown[]` | `CountdownsView` |
| `nook_countdown_pinned` | `string[]` of countdown ids | `CountdownsView` |
| `nook_habits` | `Habit[]` | `habitsStore.js` |
| `nook_habits_migrated` | `'1'` flag (one-time migration) | `habitsStore.js` |
| `nook-trackers` | `Tracker[]` | `trackers/trackerUtils.js` |
| `nook_goals` | `Goal[]` | `DailyGoalsView` |
| `nook-calendar-events` | `CalendarEvent[]` (custom events only) | `CalendarView` |
| `nook_journal_<YYYY-MM-DD>` | `JournalEntry` — **one key per day** | `JournalView` |
| `nook_journal_icons` | `{ [date]: emoji }` mood/icon map | `JournalView` |
| `nook_journal_calview` | journal calendar view mode (`week`/`month`) | `JournalView` |
| `nook_journal_calcollapsed` | journal calendar collapsed flag | `JournalView` |
| `nook-activity-log` | `ActivityEntry[]` (write-only from app POV) | `utils/activityLog.js` |
| `nook-weekly-reviews` | weekly-review snapshots | `App.jsx` / `AnalyticsDashboard` |
| `nook_custom_categories` | user-added task categories | `TaskList` |
| `nook_task_sort` | task sort preference | `TaskList` |

### UI preferences (not "content")

| Key | Meaning |
|---|---|
| `nook-sidebar-open` | `true`/`false` — sidebar full vs icon rail. In `CROSS_TAB_IGNORE_KEYS`. |
| `nook-week-start` | first day of week |
| `nook-profile-name` / `-email` / `-avatar` | local profile display |
| `nook-notif-master` / `-morning` / `-morning-time` / `-streak` / `-pomo` | notification toggles + times |
| `nook-visits` / `nook-session-visited` | visit counting |
| `nook-install-dismissed` | PWA install prompt dismissal |

### Sync / plumbing (all in `CROSS_TAB_IGNORE_KEYS`)

| Key | Meaning |
|---|---|
| `nook_google_tokens` | Google **Tasks** OAuth tokens `{accessToken, refreshToken, expiresAt}` |
| `nook_pkce_verifier` | PKCE verifier during Tasks OAuth |
| `nook_sync_enabled` | Tasks sync on/off |
| `nook_sync_queue` | pending Tasks push ops |
| `nook_deleted_tasks` | tombstones so pulls can't resurrect deleted tasks |
| `nook_last_pull_sync` | timestamp of last Tasks pull |
| `nook_gcal_tokens` | Google **Calendar** OAuth tokens |
| `nook_gcal_pkce_verifier` | PKCE verifier during Calendar OAuth |
| `nook_gcal_enabled` | Calendar sync on/off |
| `nook_gcal_push_queue` | pending Calendar push ops |
| `nook-notif-state` | notification scheduler bookkeeping |
| `nook-analytics` | legacy pomodoro log (fallback source for `nook-pomo-log`) |
| `nook_cleaned_w_duplicates` | one-time data-clean flag |

---

## Entity shapes

### Task (`nook-tasks`)

```js
{
  id: genId(),                 // base36 timestamp + random (utils/id.js)
  name: 'Write docs',
  category: 'work',            // learning | fitness | mental | work | growth (+ custom)
  priority: 'medium',          // high | medium | low | none
  timeEstimate: 25,            // minutes, clamped 1..480
  notes: '',
  dueDate: '2026-07-20',       // YYYY-MM-DD (or '' none)
  time: '14:30',               // optional time-of-day (scheduling)
  endTime: '15:30',            // optional
  isAllDay: false,
  completed: false,
  status: 'needsAction',       // Google Tasks status: needsAction | completed
  completedAt: null,           // ISO string when completed
  timeLogged: 0,               // minutes logged via focus timer
  pomodorosCompleted: 0,
  recurrence: null,            // e.g. 'daily'|'weekly'|... (LOCAL ONLY — not synced)
  recurrenceDays: [],          // days-of-week for weekly recurrence
  subtasks: [ { id, text, completed } ],   // optional
  createdAt: '<ISO>',
  updatedAt: '<ISO>',          // drives last-write-wins conflict resolution
  // Google Tasks sync bookkeeping:
  googleTaskId: null,
  lastSyncedAt: null,
  syncConflict: null,          // set to a marker when a delete/edit conflict is kept
}
```

**Field ownership matters for sync** — see [04-google-sync.md](04-google-sync.md).
On a pull, only an allowlist of fields is overwritten; everything else (category,
priority, timeEstimate, timeLogged, pomodorosCompleted, recurrence, subtasks…)
survives because Google Tasks has no concept of it.

### Habit (`nook_habits`) — `habitsStore.js`

```js
{
  id: '<base36+random>',
  name: 'Meditate',
  category: 'health',          // health|work|finance|personal|learning|fitness
  frequency: 'daily',          // 'daily'|'weekdays'|'weekends'| [0..6] day array
  timeTag: null,               // optional 'morning'/'evening' style tag
  color: '#818cf8',
  reminderEnabled: false,
  reminderTime: null,          // 'HH:MM'
  completions: ['2026-07-19', '2026-07-20'],  // plain LOCAL date strings
  createdAt: '<ISO>',
}
```

Streaks, best-streak, success-rate, the 7-day strip and 12-week (84-cell) heatmap
are all **derived** from `completions` in `habitsStore.js`. Non-scheduled days are
skipped in streak math; today-not-yet-done does not break a streak.

### Tracker (`nook-trackers`) — `trackers/trackerUtils.js`

Four types share one base shape but differ in `config` and how `logs` are read:

```js
{
  id, name,
  type: 'habit',               // habit | target | average | project
  category: 'health',          // health | work | finance | personal
  createdAt: '<ISO>',
  logs: [ { date: '2026-07-20', value: true } ],  // value: boolean|number
  config: { /* per type, below */ },
}
```

| Type | `config` | `logs[].value` | "logged today" means |
|---|---|---|---|
| `habit` | `{ schedule, timeTag }` | `true`=done, `false`=skip | a log today with `value===true` |
| `target` | `{ targetValue, unit, startValue, targetDate }` | number | any log today |
| `average` | `{ unit, targetAverage, schedule, timeTag }` | number | any log today |
| `project` | `{ milestones:[{id,done,doneAt}], targetDate }` | — | all milestones done |

`logs` are kept date-sorted ascending and **capped at 2000 entries per tracker**
(oldest dropped) in `saveTrackers`. `loadTrackers` de-dupes by id and by
case-insensitive name.

> **Habits exist twice on purpose.** A one-time `migrateFromTrackers()` (flagged by
> `nook_habits_migrated`) copied `type:'habit'` trackers into `nook_habits` — it did
> not delete them. So the same habit can legitimately appear in both the Habits tab
> (`nook_habits`) and Reports (`nook-trackers`). The shapes differ (date-string
> array vs `{date,value}` logs). Do not "dedupe" them.

### Journal entry (`nook_journal_<YYYY-MM-DD>`)

**One localStorage key per day.** Anything enumerating entries must scan keys by
the `nook_journal_` prefix.

```js
{ date: '2026-07-20', content: '<html>', createdAt: '<ISO>', updatedAt: '<ISO>' }
```

`content` is rich-text HTML (contentEditable). `nook_journal_icons` maps a date →
mood emoji separately. Export to `.docx` is handled by `utils/journalDocx.js`.

### Note (`nook_notes`) — `NotesView`

```js
{
  id: Date.now().toString(),
  title: '', content: '',      // content is rich HTML
  color: 'default',            // default|red|orange|yellow|green|teal|blue|purple|pink
  pinned: false,
  tags: [],
  createdAt: '<ISO>', updatedAt: '<ISO>',
}
```

### Link (`nook_links`) — `LinksView`

Bookmarks grouped by category; favicons are fetched from
`https://www.google.com/s2/favicons?domain=<host>&sz=32`. Each link has an `id`,
`url`, `title`, and a `category`.

### Vault entry (`nook_vault`) — `VaultView`

```js
{ id: genId(), name, username, password, url, notes?, createdAt: '<ISO>' }
```

Stored **in plaintext localStorage** (this is a convenience vault, not a
zero-knowledge password manager — see security note in
[07-build-and-setup.md](07-build-and-setup.md)).

### Countdown (`nook_countdowns`) — `CountdownsView`

Date countdowns with `category` (Personal/Work/Health/Learning/Travel/Other) and a
`priority` (low/medium/high). Pinned ids live separately in
`nook_countdown_pinned`.

### Calendar custom event (`nook-calendar-events`) — `CalendarView`

```js
{ id: genId(), title, date: 'YYYY-MM-DD', time: 'HH:MM', endTime: 'HH:MM',
  isAllDay: bool, category: 'growth', notes: '' }
```

The Calendar month grid merges **three sources**: tasks with a `dueDate`, these
custom events, and live Google Calendar events (fetched, not stored — only their
ids/fields are held transiently in state).

### Goal (`nook_goals`) — `DailyGoalsView`

Milestone- or manual-progress goals surfaced on the Today dashboard:

```js
{ id, title, milestones: [ { id, done } ], manualProgress: 0, /* 0..100 when no milestones */
  category, targetDate, createdAt }
```

Progress = `milestones.length ? round(done/total*100) : manualProgress`.

### Intentions (`nook-intentions`) — `App.jsx`

```js
{
  date: '2026-07-20',
  items: [ { id: '1', text: '', done: false }, /* seeded with 3 blank items */ ],
  history: { '2026-07-19': {/* prior day's items */ } },
}
```

Rolled over to a new day *in place* at local midnight; the previous day is pushed
into `history`.

### Pomodoro log entry (`nook-pomo-log`, legacy `nook-analytics`)

One entry per completed focus session. Consumers (Stats, DailyGoalsView,
AnalyticsDashboard) only ever read the last 7/30 days. Capped at
`MAX_POMO_LOG = 2000`.

### Settings (`nook-settings`) — `App.jsx`

```js
{ focusDuration: 25, shortDuration: 5, longDuration: 15, customDuration: 25,
  autoSwitch: false, sound: true }
```

### Activity log entry (`nook-activity-log`) — `utils/activityLog.js`

```js
{
  id: `${Date.now()}-${rand}`,   // NOTE: distinct id format from genId()
  module: 'tasks',               // tasks|calendar|habits|reports|journal…
  entity_type: 'task',
  entity_id: '<id>',
  action: 'created',             // created|updated|deleted|completed|archived|restored…
  title: 'Write docs',
  field_changes: [ { field, from, to } ] | null,  // via diffObjects()
  status: 'success',
  created_at: '<ISO>',
}
```

Newest-first (`unshift`), capped at `MAX_ENTRIES = 2000`. Every write dispatches a
`window` event `nook-activity-updated` so `ActivityLogView` live-reloads without
polling. **The activity log is write-only from the app's perspective** — reads
live entirely inside `ActivityLogView`; never route it through `App.jsx` state.

---

## ID generation — two deliberately different formats

- `utils/id.js → genId()` = `Date.now().toString(36) + Math.random().toString(36).slice(2)`.
  Used for tasks, vault, calendar events, trackers, etc.
- `utils/activityLog.js` uses a **hyphenated** `${Date.now()}-${rand}` format on
  purpose. It is **not** consolidated with `genId()`.

## Date anchoring — two conventions (do not merge)

- **`utils/date.js → todayStr()` / `localDateStr()`** produce the **local**
  calendar date. Used almost everywhere (habits, trackers, journal, countdowns).
- **`trackers/trackerUtils.js → todayStr()`** is **UTC-based**
  (`toISOString().split('T')[0]`). Intentionally distinct; different call sites
  depend on the difference.
- Date strings elsewhere are anchored at **local noon** (`new Date(ds+'T12:00:00')`)
  as a DST guard.
- **Google Tasks payloads** are the lone exception, anchored at **midnight UTC**.

Full explanation in [08-conventions-and-gotchas.md](08-conventions-and-gotchas.md).
