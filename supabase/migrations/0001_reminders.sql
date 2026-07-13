-- ═══════════════════════════════════════════════════════════════════
-- Reminders — companion scheduling table
--
-- Nook's tasks live in browser localStorage (synced to Google Tasks)
-- and calendar events are fetched live from the Google Calendar API —
-- neither is stored in Supabase. This table is NOT a copy of that data;
-- it only stores what's needed to know WHEN to fire a notification and
-- WHERE to send the user when they click it. The task/event itself
-- remains the source of truth for its name, completion status, due
-- date, etc. The client keeps this table in sync whenever a reminder
-- is set, changed, or cleared on a task/event.
-- ═══════════════════════════════════════════════════════════════════

create table public.reminders (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,

  -- Which task/event this reminder belongs to. source_id is the
  -- localStorage task id (genId() output) or the Google Calendar event id.
  source_type              text not null check (source_type in ('task', 'calendar')),
  source_id                text not null,

  -- Snapshot for display + notification payload, so the Reminders tab
  -- and the push/email content don't need a live round-trip to Google
  -- or the client's localStorage.
  title                    text not null,

  -- The due date/time (task) or start time (calendar event) this
  -- reminder is attached to. Used for Today/Upcoming/Overdue grouping.
  target_at                timestamptz not null,

  reminder_at              timestamptz not null,
  -- null = an absolute reminder_at was chosen directly.
  -- non-null = reminder_at was computed as (target_at - N minutes);
  -- kept so we can recompute reminder_at if target_at changes later.
  reminder_offset_minutes  int null,

  reminder_sent            boolean not null default false,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- One reminder per task/event; setting a new one replaces the old.
  unique (user_id, source_type, source_id)
);

-- The Edge Function's hot query: due, unsent reminders.
create index idx_reminders_due
  on public.reminders (reminder_at)
  where reminder_sent = false;

create index idx_reminders_user
  on public.reminders (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;

create policy "Users can view their own reminders"
  on public.reminders for select
  using (auth.uid() = user_id);

create policy "Users can insert their own reminders"
  on public.reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reminders"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own reminders"
  on public.reminders for delete
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════
-- Push subscriptions
-- ═══════════════════════════════════════════════════════════════════

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null,
  p256dh_key    text not null,
  auth_key      text not null,
  device_label  text null,
  created_at    timestamptz not null default now(),

  unique (endpoint)
);

create index idx_push_subscriptions_user
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
