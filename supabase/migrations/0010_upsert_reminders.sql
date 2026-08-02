-- ═══════════════════════════════════════════════════════════════════
-- upsert_reminders — bulk restore of reminders from a backup archive
--
-- Completes the backup round-trip. Export already captures reminders
-- (backup.js → data.remote.reminders); import previously wrote only
-- localStorage, so every restore silently dropped them.
--
-- Mirrors the upsert_tasks convention in 0008_tasks.sql: security
-- invoker so RLS still applies, an explicit auth.uid() guard, and the
-- loop inside plpgsql so the whole restore is ONE transaction. If row 3
-- of 10 violates a constraint, rows 1-2 roll back with it — a partial
-- reminder restore is never observable.
--
-- Deliberate differences from upsert_tasks, decided in review:
--
--   • NO last-write-wins guard. upsert_tasks only overwrites when the
--     incoming updatedAt is strictly newer, because sync is continuous
--     and bidirectional. An import is a one-shot "put my data back", and
--     the localStorage half of the same operation already overwrites
--     unconditionally — a reminders half that silently skipped rows the
--     server considered newer would half-restore with no way to tell.
--     The backup wins. A reminder edited after the backup is reverted.
--
--   • Matches on (user_id, source_type, source_id) — the table's natural
--     "one reminder per task/event" key, and what saveReminder() already
--     upserts on — NOT on id. The archive's id is ignored entirely: it
--     is internal and never user-visible, and inserting it risks a
--     PRIMARY KEY collision that the business-key conflict clause cannot
--     catch (it would abort the whole restore). Existing rows keep their
--     current id.
--
--   • Never deletes. Reminders present here but absent from the archive
--     survive, matching the additive behaviour of the local half, which
--     writes the backup's keys without clearing anything first.
--
-- Security: user_id is NEVER read from the payload — auth.uid() is
-- written literally — so a hand-edited archive naming another user
-- cannot reach their rows. jsonb_populate_record will happily parse an
-- `id` or `user_id` field out of the JSON; both are simply not used.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.upsert_reminders(p_reminders jsonb)
returns setof public.reminders
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  elem   jsonb;
  rec    public.reminders;
  result public.reminders;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  for elem in select * from jsonb_array_elements(p_reminders)
  loop
    -- Map the JSON object onto the row type. id / user_id / created_at /
    -- updated_at may be present from the export's select('*'); they are
    -- read here but never written below.
    rec := jsonb_populate_record(null::public.reminders, elem);

    insert into public.reminders as r (
      user_id, source_type, source_id, title,
      target_at, reminder_at, reminder_offset_minutes, reminder_sent
    )
    values (
      auth.uid(), rec.source_type, rec.source_id, rec.title,
      rec.target_at, rec.reminder_at, rec.reminder_offset_minutes,
      -- Preserved, not reset. Restoring an already-fired reminder as
      -- unsent would make send-task-reminders deliver it a second time.
      coalesce(rec.reminder_sent, false)
    )
    on conflict (user_id, source_type, source_id) do update set
      title                   = excluded.title,
      target_at               = excluded.target_at,
      reminder_at             = excluded.reminder_at,
      reminder_offset_minutes = excluded.reminder_offset_minutes,
      reminder_sent           = excluded.reminder_sent
      -- No LWW predicate here on purpose — see the header note.
    returning r.* into result;

    return next result;
  end loop;
end $$;

-- Callable only by a signed-in user; the auth.uid() guard and RLS do the
-- rest. anon has no business restoring anything.
revoke all on function public.upsert_reminders(jsonb) from public, anon;
grant execute on function public.upsert_reminders(jsonb) to authenticated;
