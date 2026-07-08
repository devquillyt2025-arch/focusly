-- ═══════════════════════════════════════════════════════════════════
-- Notification preferences — per-user opt-in for reminder channels
-- beyond push (currently just email). Push itself doesn't need a row
-- here: its opt-in is implied by the existence of a push_subscriptions
-- row for that user/device.
-- ═══════════════════════════════════════════════════════════════════

create table public.notification_prefs (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  email_reminders_enabled  boolean not null default false,
  updated_at               timestamptz not null default now()
);

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;

create policy "Users can view their own notification prefs"
  on public.notification_prefs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notification prefs"
  on public.notification_prefs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notification prefs"
  on public.notification_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
