# 05 — Backend (Supabase)

Nook has **no backend for your content** — tasks/notes/journal/habits/etc. live
only in the browser. Supabase exists for the five things a client-only app can't
do: fire a reminder while the tab is closed, keep an OAuth client secret off the
client, deliver Web Push, and run scheduled Drive backups. Everything here is
**optional**: with `VITE_SUPABASE_*` unset, `AuthGate` passes through and every
helper below early-returns.

`utils/authClient.js`:
```js
export const isAuthConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

## The 5 tables (migrations in `supabase/migrations/`)

All tables have **Row-Level Security** enabled; policies scope every row to
`auth.uid() = user_id`, so client reads never need an explicit `user_id` filter.

### `reminders` — `0001_reminders.sql`
When/where to fire a notification for a task or calendar event. **Not** a copy of
the task.
```
id, user_id,
source_type text check in ('task','calendar'),
source_id text,                     -- the localStorage task id or gcal event id
title text,                         -- snapshot for the notification payload
target_at timestamptz,              -- the due/start time
reminder_at timestamptz,            -- when to fire
reminder_offset_minutes int null,   -- non-null = computed as target_at - N min
reminder_sent boolean default false,
created_at, updated_at,
unique (user_id, source_type, source_id)   -- one reminder per task/event
```
Partial index `idx_reminders_due on (reminder_at) where reminder_sent=false` — the
cron function's hot query.

### `push_subscriptions` — `0001` + `0007`
Web Push endpoints, one per device.
```
id, user_id, endpoint (unique), p256dh_key, auth_key, device_label,
consecutive_failures int default 0,   -- added 0007; stop retrying dead endpoints
created_at
```

### `notification_prefs` — `0004`
```
user_id (pk), email_reminders_enabled boolean default false, updated_at
```
Push opt-in is implied by the existence of a `push_subscriptions` row, so it needs
no column here.

### `drive_backup` — `0006`
Per-user scheduled-backup settings. **The Google refresh token is never stored
here in plaintext** — it lives in Supabase **Vault**; this table holds only the
Vault secret's id.
```
user_id (pk), frequency check in ('off','daily','weekly') default 'off',
drive_folder_id, refresh_secret_id uuid, last_backup_at, last_status, last_error,
updated_at
```
Two `SECURITY DEFINER` functions (`set_drive_refresh_token`,
`get_drive_refresh_token`) are the **only** way to touch the token, and are granted
to `service_role` only.

### `backup_runs` — `0006`
Audit trail: `id, user_id, ran_at, status ('success'|'error'), file_name, counts
jsonb, error`. Users can read their own rows; only the edge function (service role)
inserts.

### Scheduling — `0003_schedule_reminders.sql`
Uses `pg_cron` + `pg_net` to `POST` the `send-task-reminders` function **every
minute**. The cron secret is stored via Supabase Vault (`vault.create_secret(...,
'cron_secret')`), never in the migration file, and passed as an `X-Cron-Secret`
header.

---

## The 4 edge functions (`supabase/functions/`, Deno)

| Function | Trigger | JWT | Purpose |
|---|---|---|---|
| `google-oauth` | Browser `functions.invoke` | **verify** | Server-side Google OAuth token exchange/refresh for **Tasks & Calendar**. Holds `GOOGLE_CLIENT_SECRET`; returns tokens to the client (which stores them in localStorage). Grants: `authorization_code` and `refresh_token`. |
| `connect-drive` | Browser `functions.invoke` | **verify** | One-time Drive "offline access" consent exchange (`scope=drive.file`, `access_type=offline`). Stores the long-lived refresh token in Vault; it **never** returns to the client. |
| `drive-backup` | Browser (client builds the backup from localStorage and POSTs it) | **verify** | Mints a fresh Drive access token from the Vault refresh token, ensures a "Nook Backups" folder, uploads `nook-backup-<date>.json`, prunes to newest 7, records a `backup_runs` row. Payload is forwarded to Drive, never persisted in Supabase. |
| `send-task-reminders` | `pg_cron` via `pg_net`, every minute | **--no-verify-jwt** (gated by `X-Cron-Secret`) | Finds due unsent reminders, delivers via push (if a subscription exists) and/or email (if `email_reminders_enabled`), independently, marks them sent. Deletes expired push endpoints (404/410/401/403). Uses `web-push` and (optionally) Resend for email. |

> **Why `google-oauth` and `connect-drive` differ:** both keep the client secret
> server-side, but `google-oauth` *returns* tokens (Tasks/Calendar call
> googleapis.com from the browser), whereas `connect-drive` *keeps* the refresh
> token in Vault (only the server ever needs it for scheduled backups).

---

## Web Push (`public/sw.js` + `utils/pushSubscription.js`)

- `index.html` registers `/sw.js` on load.
- `utils/pushSubscription.js` subscribes the browser to Web Push using
  `VITE_VAPID_PUBLIC_KEY`, and upserts the endpoint into `push_subscriptions`.
- `send-task-reminders` signs pushes with the VAPID key pair (`VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) and delivers them; `sw.js` shows the
  notification and routes the click.
- Local (non-push) notifications for morning/streak/pomodoro use the
  Notifications API directly via `utils/notificationUtils.js` and are scheduled
  from `App.jsx`.

## Backup / export / import (`utils/backup.js`, `driveBackup.js`, `autoBackup.js`)

- `buildBackup()` serialises the localStorage content slices into one JSON blob.
  Manual **Export** downloads it; **Import** restores it.
- **Reminders and notification prefs are intentionally NOT carried between devices
  on import** — they're re-fetched from Supabase on export and are tied to
  per-device/per-user rows.
- `autoBackup.js` enforces the *schedule* client-side (only the browser can read
  localStorage) — `maybeRunAutoBackup()` runs on mount, and when a daily/weekly
  backup is due it invokes the `drive-backup` function with a freshly built
  payload.

---

## Environment variables

### Client (Vite — `VITE_` prefix, **inlined into the bundle**, so public-safe only)

| Var | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL. Absence ⇒ auth off, all cloud helpers no-op. |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key. |
| `VITE_GOOGLE_CLIENT_ID` | Public Google OAuth client id (Tasks/Calendar/Drive consent). |
| `VITE_VAPID_PUBLIC_KEY` | Web Push public key. |

> A `VITE_`-prefixed secret is shipped to every user. The Google **client
> secret**, VAPID **private** key, cron secret, and service role key are therefore
> **only** ever set as edge-function / server env — never `VITE_`.

### Edge functions / server (Deno env, never shipped to client)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `RESEND_API_KEY` (optional),
`RESEND_FROM` (optional), `SITE_URL`.

---

## SSO handoff from the `landing/` app

`AuthGate` reads `#sb_access_token=...&sb_refresh_token=...` from the URL hash
(set by the marketing site after login), establishes the Supabase session, then
scrubs the hash. Those custom hash keys deliberately avoid Supabase's native
OAuth/magic-link hash format (handled by `detectSessionInUrl`). Don't rename them
on one side only.
