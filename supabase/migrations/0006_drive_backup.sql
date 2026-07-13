-- ═══════════════════════════════════════════════════════════════════
-- Automated Google Drive backup (client-scheduled, Edge-Function upload)
--
-- Nook's real content lives in browser localStorage, which no server can
-- read — so the *schedule* is enforced client-side (see src/utils/
-- autoBackup.js). This table stores each user's chosen frequency and the
-- bookkeeping the drive-backup Edge Function needs. The Google refresh
-- token is NEVER stored here in plaintext: it lives in Supabase Vault, and
-- this table only holds the Vault secret's id.
-- ═══════════════════════════════════════════════════════════════════

create table public.drive_backup (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  frequency          text not null default 'off' check (frequency in ('off','daily','weekly')),
  drive_folder_id    text,                 -- cached "Nook Backups" folder id
  refresh_secret_id  uuid,                 -- id of the Vault secret holding the refresh token
  last_backup_at     timestamptz,
  last_status        text,                 -- 'success' | 'error'
  last_error         text,
  updated_at         timestamptz not null default now()
);

create trigger drive_backup_set_updated_at
  before update on public.drive_backup
  for each row execute function public.set_updated_at();

create table public.backup_runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ran_at     timestamptz not null default now(),
  status     text not null check (status in ('success','error')),
  file_name  text,
  counts     jsonb,
  error      text
);
create index idx_backup_runs_user on public.backup_runs (user_id, ran_at desc);

alter table public.drive_backup enable row level security;
alter table public.backup_runs  enable row level security;

-- Users read/write their own settings row. The refresh_secret_id column is
-- only an opaque uuid (not the token), so exposing it via select is harmless.
create policy "own drive_backup" on public.drive_backup for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users may read their own run log; rows are inserted only by the Edge
-- Function (service role bypasses RLS), so there is no user insert policy.
create policy "own backup_runs read" on public.backup_runs for select
  using (auth.uid() = user_id);

-- ── Vault helpers (service-role only) ────────────────────────────────
-- The refresh token is read/written exclusively through these SECURITY
-- DEFINER functions, so it is never selectable by anon/authenticated
-- clients — only the Edge Functions (service_role) can touch it.

create or replace function public.set_drive_refresh_token(p_user uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_id uuid;
begin
  select refresh_secret_id into v_id from public.drive_backup where user_id = p_user;
  if v_id is null then
    v_id := vault.create_secret(p_token, 'drive_refresh_' || p_user::text, 'Nook Drive backup refresh token');
    insert into public.drive_backup (user_id, refresh_secret_id)
      values (p_user, v_id)
      on conflict (user_id) do update set refresh_secret_id = excluded.refresh_secret_id;
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $$;

create or replace function public.get_drive_refresh_token(p_user uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select ds.decrypted_secret
  from public.drive_backup db
  join vault.decrypted_secrets ds on ds.id = db.refresh_secret_id
  where db.user_id = p_user;
$$;

-- Lock the token helpers down to service_role only.
revoke all on function public.set_drive_refresh_token(uuid, text) from public, anon, authenticated;
revoke all on function public.get_drive_refresh_token(uuid)       from public, anon, authenticated;
grant execute on function public.set_drive_refresh_token(uuid, text) to service_role;
grant execute on function public.get_drive_refresh_token(uuid)       to service_role;
