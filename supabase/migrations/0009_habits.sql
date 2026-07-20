-- ═══════════════════════════════════════════════════════════════════
-- Habits — cross-device sync table
--
-- Same design as tasks (migration 0008): Supabase is the source of truth,
-- localStorage (nook_habits) is a write-through cache, reconciled last-
-- write-wins on the app-level "updatedAt". Columns are quoted camelCase so
-- they mirror the JS habit object 1:1 (no field-drop mapper). Writes go
-- through an atomic upsert_habits RPC whose ON CONFLICT ... WHERE makes the
-- LWW compare a single indivisible operation. Composite (user_id, id) PK for
-- the same reason as tasks: ids are client-generated (base36 timestamp +
-- random), not uuids, so scoping the PK by user_id removes cross-user id
-- collisions. Delete is soft (deleted_at tombstone), not a row removal.
--
-- Habits differ from tasks in four ways, all handled here:
--
--  1. NO "updatedAt" IN THE ORIGINAL SHAPE. Habits only had createdAt. The
--     whole LWW mechanism needs updatedAt, so the client now stamps it on
--     every write, and the one-time migration backfills it to createdAt for
--     existing rows. The column is plain timestamptz like tasks.
--
--  2. `completions` IS AN APPEND-MOSTLY SET, MERGED BY PURE LWW (decided).
--     The whole habit row (including its completions array) is replaced when
--     the incoming "updatedAt" is newer — identical trade-off to tasks. A
--     completion ticked on another device inside the same offline window can
--     be lost; union-merge was rejected to avoid toggle-off ambiguity.
--
--  3. `frequency` IS string | number[] ('daily' | 'weekdays' | 'weekends' |
--     [0..6]). Stored as jsonb to hold both shapes faithfully.
--
--  4. NO SECOND SYNC SYSTEM. Unlike tasks (googleTasksSync.js), nothing else
--     writes nook_habits, so there is no coexistence layer here.
--
-- SCOPE: this syncs nook_habits (the Habits tab) ONLY. The separate
-- type='habit' rows in nook-trackers (Reports) are intentionally left local
-- per CLAUDE.md ("habits exist twice on purpose — do not dedupe").
-- ═══════════════════════════════════════════════════════════════════

create table public.habits (
  id                 text not null,
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- ── Habit fields, verbatim from the localStorage shape ──
  name               text,
  category           text,
  frequency          jsonb,          -- 'daily'|'weekdays'|'weekends' OR number[] day-of-week
  "timeTag"          text,
  color              text,
  "reminderEnabled"  boolean,
  "reminderTime"     text,           -- 'HH:MM' or null
  completions        jsonb,          -- ['YYYY-MM-DD', …] local date strings; pure-LWW replaced
  archived           boolean,
  "createdAt"        timestamptz,
  "updatedAt"        timestamptz,    -- added for sync; DRIVES last-write-wins (backfilled to createdAt on migration)

  -- ── Supabase infra columns (identical to tasks) ──
  deleted_at         timestamptz,    -- soft-delete tombstone (propagates deletes across devices)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  primary key (user_id, id)
);

-- Incremental fetch / ordering by the app-level edit time (fetch-since).
create index idx_habits_user_updated
  on public.habits (user_id, "updatedAt");

-- Reuses public.set_updated_at() defined in 0001_reminders.sql.
create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

alter table public.habits enable row level security;

create policy "Users can view their own habits"
  on public.habits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own habits"
  on public.habits for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own habits"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own habits"
  on public.habits for delete
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════
-- upsert_habits(p_habits jsonb) — atomic, last-write-wins bulk upsert
-- (identical mechanism to upsert_tasks; see 0008 for the full rationale)
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.upsert_habits(p_habits jsonb)
returns setof public.habits
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  elem   jsonb;
  rec    public.habits;
  result public.habits;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  for elem in select * from jsonb_array_elements(p_habits)
  loop
    rec := jsonb_populate_record(null::public.habits, elem);

    insert into public.habits as h (
      id, user_id, name, category, frequency, "timeTag", color,
      "reminderEnabled", "reminderTime", completions, archived,
      "createdAt", "updatedAt", deleted_at
    )
    values (
      rec.id, auth.uid(), rec.name, rec.category, rec.frequency, rec."timeTag", rec.color,
      rec."reminderEnabled", rec."reminderTime", rec.completions, rec.archived,
      rec."createdAt", rec."updatedAt", rec.deleted_at
    )
    on conflict (user_id, id) do update set
      name              = excluded.name,
      category          = excluded.category,
      frequency         = excluded.frequency,
      "timeTag"         = excluded."timeTag",
      color             = excluded.color,
      "reminderEnabled" = excluded."reminderEnabled",
      "reminderTime"    = excluded."reminderTime",
      completions       = excluded.completions,
      archived          = excluded.archived,
      "createdAt"       = excluded."createdAt",
      "updatedAt"       = excluded."updatedAt",
      deleted_at        = excluded.deleted_at
      -- LWW guard: only overwrite when the incoming edit is strictly newer.
      where excluded."updatedAt" > h."updatedAt"
    returning h.* into result;

    if result.id is null then
      select * into result
        from public.habits
        where user_id = auth.uid() and id = rec.id;
    end if;

    return next result;
  end loop;
end;
$$;

-- Enables the Realtime subscription (Phase 5). Required, not optional, on this
-- project: it does not publish all tables (verified when adding tasks in 0008).
alter publication supabase_realtime add table public.habits;
