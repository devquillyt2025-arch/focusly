-- ═══════════════════════════════════════════════════════════════════
-- 0011 — two related fixes to the tasks/habits sync layer.
--
-- Both come from the same root cause: a write that produces no
-- tombstone, or no "updatedAt" the last-write-wins logic can act on,
-- leaves a row the client can never correct again.
--
--   PART A (audit H1) — harden the LWW guard against NULL "updatedAt",
--   and backfill the rows already stuck because of it.
--
--   PART B (audit C2) — restore_tasks / restore_habits: the backup-wins
--   bulk upsert that makes "import a backup" actually put tasks and
--   habits back, instead of letting an existing tombstone delete them
--   again on the next hydrate.
-- ═══════════════════════════════════════════════════════════════════


-- ── PART A ─────────────────────────────────────────────────────────
-- upsert_tasks / upsert_habits guarded with
--   where excluded."updatedAt" > t."updatedAt"
-- which is SQL three-valued logic: the moment either side is NULL the
-- predicate is NULL, and a NULL WHERE is not true, so the UPDATE never
-- fires. A row that once landed with a null "updatedAt" could therefore
-- never be updated OR soft-deleted again — and because the soft delete
-- silently no-opped, the row stayed live and every hydrate re-adopted
-- it. Deleting such a task made it reappear seconds later, forever.
--
-- The replacement predicate keeps the original intent exactly:
--   • incoming NULL never clobbers a stored value  (guarded explicitly
--     now rather than as a side effect of NULL propagation)
--   • otherwise strictly-newer still wins
--   • NEW: a stored NULL is treated as older than any real timestamp,
--     so the row is repairable instead of frozen.
--
-- Client-side, tasksService.stampUpdatedAt() now backfills at the write
-- boundary so nothing new arrives null. This is the defence-in-depth
-- half, and the only thing that can rescue rows already in production.

-- Repair rows already frozen. "createdAt" is the honest fallback (it is
-- what habitsService has always backfilled to); created_at is the DB
-- audit column, used only when the app timestamp is missing too.
update public.tasks
   set "updatedAt" = coalesce("createdAt", created_at, now())
 where "updatedAt" is null;

update public.habits
   set "updatedAt" = coalesce("createdAt", created_at, now())
 where "updatedAt" is null;

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
      -- NULL-safe LWW guard — see PART A header.
      where excluded."updatedAt" is not null
        and (t."updatedAt" is null or excluded."updatedAt" > t."updatedAt")
    returning t.* into result;

    if result.id is null then
      select * into result
        from public.tasks
        where user_id = auth.uid() and id = rec.id;
    end if;

    return next result;
  end loop;
end;
$$;

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
      -- Same NULL-safe guard as upsert_tasks. habitsService already
      -- backfilled at its migration boundary so no habit is known to be
      -- frozen, but leaving the two guards asymmetric is precisely how
      -- the tasks side ended up with this bug in the first place.
      where excluded."updatedAt" is not null
        and (h."updatedAt" is null or excluded."updatedAt" > h."updatedAt")
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


-- ── PART B ─────────────────────────────────────────────────────────
-- restore_tasks / restore_habits — backup-wins bulk upsert for import.
--
-- Import writes localStorage and reloads. For tasks and habits that was
-- not enough: Supabase is the cross-device source of truth, so a task
-- deleted AFTER the backup was taken still had a tombstone whose
-- "updatedAt" was newer than the restored copy's. reconcileTasks saw
-- the tombstone win and deleted the task again, seconds after the
-- import reported success. A restore could not put back the one thing
-- users run a restore for.
--
-- Semantics deliberately match the reminder restore settled in 0010:
--
--   • THE BACKUP WINS, unconditionally. No LWW guard — that is the
--     whole point. Importing a backup is a one-shot "put my data back",
--     and the localStorage half of the same operation already
--     overwrites unconditionally. A tasks half that silently skipped
--     rows the server thought were newer would half-restore with no
--     way to tell.
--
--   • NEVER DELETES. Tasks present remotely but absent from the archive
--     survive, matching the additive behaviour of the local half. A
--     restore is therefore a UNION, not a replacement — the import
--     confirm copy in App.jsx says so in those words.
--
-- ONE deliberate difference from 0010: reminders are matched on their
-- business key and the archive's `id` is discarded, because a reminder
-- id is internal and never user-visible. A task id is NOT internal — it
-- is the same value locally and remotely by design (see 0008), and it
-- is referenced by googleTaskId mapping, the activity log, and a
-- reminder's source_id. So the archive's id is KEPT and is the conflict
-- target. Restoring must not renumber tasks.
--
-- user_id is always auth.uid(), never read from the payload, so a
-- hand-edited archive naming another user cannot reach their rows.

create or replace function public.restore_tasks(p_tasks jsonb)
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
    rec := jsonb_populate_record(null::public.tasks, elem);

    -- A task with no id cannot be keyed; skip rather than abort the
    -- whole transaction and lose every good row with it.
    continue when rec.id is null;

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
      rec."recurrenceDays", rec.subtasks, rec."createdAt",
      -- Never let a restore reintroduce the PART A freeze.
      coalesce(rec."updatedAt", rec."createdAt", now()),
      rec."googleTaskId", rec."lastSyncedAt", rec."syncConflict",
      -- Forced null, not carried from the payload: a backup only ever
      -- contains live tasks, and clearing the tombstone is what makes a
      -- restore able to bring a deleted task back at all.
      null
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
      deleted_at           = excluded.deleted_at   -- null → resurrects
      -- No WHERE. The backup wins; see the header.
    returning t.* into result;

    return next result;
  end loop;
end;
$$;

create or replace function public.restore_habits(p_habits jsonb)
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

    continue when rec.id is null;

    insert into public.habits as h (
      id, user_id, name, category, frequency, "timeTag", color,
      "reminderEnabled", "reminderTime", completions, archived,
      "createdAt", "updatedAt", deleted_at
    )
    values (
      rec.id, auth.uid(), rec.name, rec.category, rec.frequency, rec."timeTag", rec.color,
      rec."reminderEnabled", rec."reminderTime", rec.completions, rec.archived,
      rec."createdAt",
      coalesce(rec."updatedAt", rec."createdAt", now()),
      null
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
    returning h.* into result;

    return next result;
  end loop;
end;
$$;

-- Signed-in users only; the auth.uid() guard and RLS do the rest.
revoke all on function public.restore_tasks(jsonb)  from public, anon;
revoke all on function public.restore_habits(jsonb) from public, anon;
grant execute on function public.restore_tasks(jsonb)  to authenticated;
grant execute on function public.restore_habits(jsonb) to authenticated;
