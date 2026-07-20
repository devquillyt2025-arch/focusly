-- ═══════════════════════════════════════════════════════════════════
-- Tasks — cross-device sync table
--
-- Unlike reminders (which only store WHEN to fire a notification), this
-- table IS a copy of the user's tasks. It makes Supabase the cross-device
-- source of truth for tasks so a task created on desktop shows up on
-- mobile. The existing Google Tasks sync (utils/googleTasksSync.js) is
-- left completely untouched and keeps running independently for users who
-- enabled it; both it and this table write to the same local `nook-tasks`
-- array and reconcile via the app-level `updatedAt` (last-write-wins).
--
-- COLUMN NAMING (deliberate): task-field columns are quoted camelCase so
-- they match the JavaScript task object's keys *exactly*. This lets the
-- client persist a task 1:1 with no hand-maintained field map — which is
-- what prevents silently dropping Google-sync fields (googleTaskId,
-- lastSyncedAt, syncConflict) or the LWW driver (updatedAt).
--
-- The app's own "createdAt"/"updatedAt" are kept DISTINCT from the
-- Supabase audit columns created_at/updated_at. Do NOT merge them: the
-- audit updated_at is bumped by a trigger on every server-side write
-- (including a pull-sync write), so using it for last-write-wins would let
-- a mechanical touch falsely win a genuine edit. Reconciliation MUST use
-- the app-level "updatedAt".
--
-- PRIMARY KEY is composite (user_id, id). Task ids are client-generated
-- genId() values (base36 timestamp + random), not uuids. A single-column
-- PK would make two users generating the same id in the same millisecond
-- window a global collision — not a security issue (RLS blocks cross-user
-- reads) but a silent insert failure for the second user's legitimate
-- task. Scoping the PK by user_id removes that class of bug entirely.
-- ═══════════════════════════════════════════════════════════════════

create table public.tasks (
  -- Client-generated genId(), NOT a uuid. Kept as (part of) the key so a
  -- task's local id and remote id are the same value.
  id                    text not null,
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- ── Task fields, verbatim from the localStorage shape ──
  name                  text,
  category              text,
  priority              text,
  "timeEstimate"        integer,
  notes                 text,
  "dueDate"             text,          -- 'YYYY-MM-DD' or '' — text preserves the empty-string "no date"
  time                  text,          -- 'HH:MM' optional
  "endTime"             text,          -- 'HH:MM' optional
  "isAllDay"            boolean,
  completed             boolean,
  status                text,          -- 'needsAction' | 'completed'
  "completedAt"         timestamptz,
  "timeLogged"          numeric,       -- numeric to store the value verbatim, whatever its unit
  "pomodorosCompleted"  integer,
  recurrence            text,          -- LOCAL-only (Google never sees it), but still synced across devices
  "recurrenceDays"      jsonb,         -- day-of-week array
  subtasks              jsonb,         -- [{ id, text, completed }]
  "createdAt"           timestamptz,   -- app timestamp (not the DB audit column below)
  "updatedAt"           timestamptz,   -- app timestamp — DRIVES last-write-wins reconciliation
  "googleTaskId"        text,          -- Google Tasks mapping id (null until synced to Google)
  "lastSyncedAt"        timestamptz,
  "syncConflict"        jsonb,         -- conflict marker; jsonb tolerates a string or a structured value

  -- ── Supabase infra columns ──
  -- Soft delete. The client deletes a task by setting deleted_at (a
  -- tombstone) rather than removing the row, so the deletion propagates to
  -- other devices on their next fetch instead of the task reappearing.
  deleted_at            timestamptz,

  -- DB audit timestamps — server-managed, separate from the app timestamps
  -- above. created_at/updated_at answer "when did the server last touch
  -- this row", NOT "when did the user last edit the task".
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  primary key (user_id, id)
);

-- Incremental fetch / ordering by the app-level edit time (fetch-since).
-- (A separate index on (user_id) is unnecessary — the composite PK's index
-- already serves user_id-prefixed lookups.)
create index idx_tasks_user_updated
  on public.tasks (user_id, "updatedAt");

-- Reconciliation lookups by Google mapping id (only rows that have one).
create index idx_tasks_google
  on public.tasks (user_id, "googleTaskId")
  where "googleTaskId" is not null;

-- Reuses public.set_updated_at() defined in 0001_reminders.sql.
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════
-- upsert_tasks(p_tasks jsonb) — atomic, last-write-wins bulk upsert
--
-- Writes go through this RPC rather than a plain PostgREST upsert because
-- the LWW comparison must be ATOMIC. A read-then-compare-then-write in the
-- client has a race window: two devices can both read stale state, both
-- decide they're newer, and both write. Folding the comparison into the
-- statement's ON CONFLICT ... WHERE makes "only overwrite if my edit is
-- newer" a single indivisible operation, no gap.
--
-- p_tasks is a JSON array of task objects (single write = a 1-element
-- array; the Phase 4 migration = the whole local list). Keys must match
-- the column names exactly (they do, by the camelCase design above), which
-- is why jsonb_populate_record can map them 1:1. user_id is always forced
-- to auth.uid() — a client-supplied user_id is ignored.
--
-- Returns the resulting row for each input: the freshly written row on a
-- win, or the untouched existing row when the guard rejects an older write
-- (so the caller always learns the authoritative current state).
--
-- SECURITY INVOKER (default): the INSERT/UPDATE inside still runs under the
-- caller's RLS, so a user can only ever write their own rows.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.upsert_tasks(p_tasks jsonb)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  elem   jsonb;
  rec    public.tasks;
  result public.tasks;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  for elem in select * from jsonb_array_elements(p_tasks)
  loop
    -- Map the JSON object onto the row type (keys → columns, 1:1).
    rec := jsonb_populate_record(null::public.tasks, elem);

    insert into public.tasks as t (
      id, user_id, name, category, priority, "timeEstimate", notes,
      "dueDate", time, "endTime", "isAllDay", completed, status,
      "completedAt", "timeLogged", "pomodorosCompleted", recurrence,
      "recurrenceDays", subtasks, "createdAt", "updatedAt",
      "googleTaskId", "lastSyncedAt", "syncConflict", deleted_at
    )
    values (
      rec.id, auth.uid(), rec.name, rec.category, rec.priority, rec."timeEstimate", rec.notes,
      rec."dueDate", rec.time, rec."endTime", rec."isAllDay", rec.completed, rec.status,
      rec."completedAt", rec."timeLogged", rec."pomodorosCompleted", rec.recurrence,
      rec."recurrenceDays", rec.subtasks, rec."createdAt", rec."updatedAt",
      rec."googleTaskId", rec."lastSyncedAt", rec."syncConflict", rec.deleted_at
    )
    on conflict (user_id, id) do update set
      name                 = excluded.name,
      category             = excluded.category,
      priority             = excluded.priority,
      "timeEstimate"       = excluded."timeEstimate",
      notes                = excluded.notes,
      "dueDate"            = excluded."dueDate",
      time                 = excluded.time,
      "endTime"            = excluded."endTime",
      "isAllDay"           = excluded."isAllDay",
      completed            = excluded.completed,
      status               = excluded.status,
      "completedAt"        = excluded."completedAt",
      "timeLogged"         = excluded."timeLogged",
      "pomodorosCompleted" = excluded."pomodorosCompleted",
      recurrence           = excluded.recurrence,
      "recurrenceDays"     = excluded."recurrenceDays",
      subtasks             = excluded.subtasks,
      "createdAt"          = excluded."createdAt",
      "updatedAt"          = excluded."updatedAt",
      "googleTaskId"       = excluded."googleTaskId",
      "lastSyncedAt"       = excluded."lastSyncedAt",
      "syncConflict"       = excluded."syncConflict",
      deleted_at           = excluded.deleted_at
      -- LWW guard: only overwrite when the incoming edit is strictly newer.
      -- A null incoming "updatedAt" makes this false, so an unstamped write
      -- can never clobber a stamped one.
      where excluded."updatedAt" > t."updatedAt"
    returning t.* into result;

    -- No row returned = the guard rejected an older write. Return the
    -- untouched current row so the caller sees the authoritative state.
    if result.id is null then
      select * into result
        from public.tasks
        where user_id = auth.uid() and id = rec.id;
    end if;

    return next result;
  end loop;
end;
$$;

-- Enables the Phase 5 Realtime subscription (a task created on one device
-- pushes to the other without a manual refresh). Safe to run now; if the
-- table is already in the publication this line will error harmlessly and
-- can be skipped.
alter publication supabase_realtime add table public.tasks;
