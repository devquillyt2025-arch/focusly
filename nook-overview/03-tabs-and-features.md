# 03 — Tabs & Features

Nook has **14 tabs**. Tab ids come from `App.jsx` (`allTabs`, ~line 1270). Note the
id → label mapping is **not** 1:1 — three ids read differently in the UI:
`daily`→"Today", `vault`→"Saved Logins", `timer`→"Focus Timer".

| id | Label | Owns | Key files | Storage |
|---|---|---|---|---|
| `daily` | Today | Day dashboard, intentions, at-a-glance goals, recent activity | `DailyGoalsView`, `DailyIntentions` (rendered by `App`, not by the view) | `nook-intentions`, `nook_goals` |
| `tasks` | Tasks | Tasks, subtasks, scheduling, Google Tasks sync entry | `TaskList` (~1765 ln), `AddTaskModal`, `ReminderField` | `nook-tasks`, `nook_task_sort`, `nook_custom_categories` |
| `notes` | Notes | Rich-text notes + `NoteModal` | `NotesView` | `nook_notes` |
| `calendar` | Calendar | Month grid, custom events, Google Calendar overlay | `CalendarView`, `utils/googleCalendarSync.js` | `nook-calendar-events`, `nook_gcal_*` |
| `reminders` | Reminders | Supabase-backed reminders (see 05) | `RemindersView`, `utils/reminders.js` | **Supabase only** |
| `vault` | Saved Logins | Credential vault | `VaultView` | `nook_vault` |
| `links` | Links | Bookmarks + categories | `LinksView` | `nook_links` |
| `countdowns` | Countdowns | Date countdowns, pinning | `CountdownsView` | `nook_countdowns`, `nook_countdown_pinned` |
| `habits` | Habits | Standalone habit tracking | `HabitsView`, `habitsStore.js` | `nook_habits`, `nook_habits_migrated` |
| `timer` | Focus Timer | Pomodoro + focus companion | `Timer`, `FocusCompanion`, `utils/timerTickStore.js` | `nook-pomo-log` (legacy fallback `nook-analytics`) |
| `journal` | Journal | Per-day entries, week/month calendar, `.docx` export | `JournalView` | `nook_journal_<date>`, `nook_journal_icons`, `nook_journal_calview`, `nook_journal_calcollapsed` |
| `reports` | Reports | Trackers + analytics + charts | `ReportsView`, `trackers/*`, `AnalyticsDashboard`, `TrackerCharts` | `nook-trackers` |
| `activity` | Activity Log | Cross-module audit trail | `ActivityLogView`, `utils/activityLog.js` | `nook-activity-log` |
| `settings` | Settings | Profile, theme, notifications, backup, integrations | `SettingsView`, `utils/backup.js`, `driveBackup.js` | `nook-settings`, `nook-profile-*`, `nook-notif-*`, `nook-theme` |

---

## What each tab does

### Today (`daily`)
The landing dashboard. Shows the day's **intentions** (3 seeded editable items,
rendered by `App` itself via `DailyIntentions`), an at-a-glance view of **goals**
(`nook_goals`) with progress, today's completed tasks/habits as a "recent
activity" feed, and time-tracked-by-category summaries. `DailyGoalsView` pulls
from tasks, habits, journal, and the pomodoro log to compute the day view.

### Tasks (`tasks`)
The largest view. A dashboard grid with a **Pending** card (grouped into
Overdue / Today / Upcoming, each independently scrollable) and a **Completion
Analytics** card. Each task row has a three-dot kebab menu, inline metadata icons
(recurrence, subtasks, attachments, notes, time logged, pomodoros, sync conflict),
and a detail panel with three tabs: **Details**, **Scheduling**, **Subtasks**.
Scheduling edits push instantly to Google via `syncTaskField()` (bypasses the
queue). Recurrence is **local-only** — Nook creates the next occurrence itself.
Custom categories are stored in `nook_custom_categories`.

### Notes (`notes`)
Grid of colour-coded rich-text notes with pin + tags. `NoteModal` (a lazy named
export of `NotesView`) is the editor. Includes a one-time content-dedup migration
for a specific historical corruption pattern.

### Calendar (`calendar`)
Month grid + day panel merging **three event sources**: tasks with a `dueDate`,
custom events (`nook-calendar-events`), and live Google Calendar events. Supports
drag-to-reschedule (updates the task's `dueDate`/`time` or the event). Google
Calendar events are read live and not persisted.

### Reminders (`reminders`)
The **only** tab that is a pure Supabase read/write with no local mirror. Lists
reminders grouped Overdue / Today / Upcoming. **Empty when `isAuthConfigured` is
false.** A reminder stores only *when* to fire and *where* to send the user — the
task/event remains the source of truth for its content.

### Saved Logins (`vault`)
Credential vault (`nook_vault`). Add/edit/reveal/copy username+password+url. Stored
in plaintext localStorage.

### Links (`links`)
Bookmark manager with categories and auto-fetched favicons.

### Countdowns (`countdowns`)
Countdown-to-date cards with category colours and priority; pinned countdowns
surface first.

### Habits (`habits`)
Standalone habit tracker (`nook_habits`, distinct from Reports trackers). Sticky
stats/filter header over a scrollable habit list. Each habit shows a 7-day strip,
a 12-week (84-cell) heatmap, current/best streak, and success rate — all derived
in `habitsStore.js`. Detail/edit modals are centered glass panels.

### Focus Timer (`timer`)
Pomodoro timer (focus / short / long / custom durations from settings, long break
after 4 focus sessions) plus a `FocusCompanion`. Completed sessions append to
`nook-pomo-log`. **The 1-second tick is an external store**
(`utils/timerTickStore.js`) read via `useSyncExternalStore`, so ticking re-renders
only `Timer` / `FocusCompanion` / `DailyGoalsView`, not the whole app. The
countdown is derived from a `timerEndAt` wall-clock delta (not accumulated
intervals) so background-tab throttling can't drift it.

### Journal (`journal`)
Per-day rich-text journaling. **One localStorage key per day**
(`nook_journal_<YYYY-MM-DD>`). Left: a contentEditable editor with a pinned
date/day header; right: a metadata panel (mood badge, word/entry/streak stats, a
week/month calendar of entries, activity). Exports a date range to `.docx` via
`utils/journalDocx.js`. Mood icons per day live in `nook_journal_icons`.

### Reports (`reports`)
Trackers + analytics. `ReportsView` hosts the four tracker types, a global stats
strip, sparklines, and charts. `AnalyticsDashboard` and `TrackerCharts` each call
`ChartJS.register(...)` independently — `register()` is idempotent so the overlap
is harmless; don't collapse them into one shared registration point.

### Activity Log (`activity`)
Cross-module audit trail (`nook-activity-log`). Live-reloads on the
`nook-activity-updated` window event and cross-tab `storage` events, throttled to
once per 1.5s. Read-only from the app's perspective.

### Settings (`settings`)
Profile (name/email/avatar, local only), theme toggle, week-start, notification
preferences (master + morning/streak/pomo toggles and times), backup/export/import
(`utils/backup.js`), and integration connect/disconnect for Google Tasks, Google
Calendar, and Drive backup.

---

## Shared widgets / components (not tabs)

| File | Role |
|---|---|
| `SidebarSearch.jsx` | Command-palette search (Ctrl/Cmd+K) across notes, countdowns, journal, vault, links. Exports `useNookSearch`, `ResultsList`. |
| `SidebarFlyout.jsx` | Flyout menus off the collapsed icon rail; `useIsRail()` watches `.main-nav` class via `MutationObserver`. |
| `Select.jsx` | Custom styled select. |
| `TimePicker.jsx` / `CalendarDatePicker.jsx` | Date/time inputs. |
| `ReminderField.jsx` | Reminder picker used by tasks (writes to Supabase `reminders`). |
| `Stats.jsx` | Small stat tiles (pomodoro/day summaries). |
| `ShortcutsModal.jsx` | Keyboard-shortcuts help. |
| `WeeklyReviewModal.jsx` | Weekly review flow (`nook-weekly-reviews`). |
| `AnalyticsModal.jsx` / `AnalyticsDashboard.jsx` / `TrackerCharts.jsx` | Reports analytics + chart.js visuals. |
| `AddTaskModal.jsx` / `AddTrackerModal.jsx` | Creation modals. |
| `ErrorBoundary.jsx` | Top-level render-error recovery. |
| `AuthGate.jsx` / `AuthPage.jsx` | Optional auth + SSO handoff + login UI. |

## Navigation structure (desktop rail)

Defined by three inline arrays in `App.jsx` (~line 1212), each under a
`.nav-section-label` (rendered UPPERCASE via CSS), with dividers before More and
Utility. Settings is pinned at the bottom, outside the sections.

- **Main:** Today, Tasks, Calendar, Habits, Journal, Reminders, Notes
- **More:** Focus (`timer`), Links, Countdowns
- **Utility:** Reports, Activity Log, Saved Logins (`vault`)

Only Main rows carry badges (`daily`→ unlogged-today count, `tasks`→ incomplete
count). The **mobile bottom nav** (Today, Tasks, Journal, Habits + More) is a
**separate hardcoded list** — it does not follow these arrays. On screens ≤768px
the desktop rail is `display:none` regardless of open/rail state. See
[06-ui-and-styling.md](06-ui-and-styling.md) for the sidebar rail mechanics.
