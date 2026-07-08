-- ═══════════════════════════════════════════════════════════════════
-- Schedule send-task-reminders (Edge Function) to run every minute.
--
-- pg_cron fires the schedule below; pg_net makes the actual HTTP call
-- to the deployed function. The function is gated by an X-Cron-Secret
-- header rather than a user JWT (there's no signed-in user in a cron
-- context) — deploy it with `--no-verify-jwt`.
--
-- The secret value itself is NOT stored in this file. Before running
-- this migration, store it once via the SQL editor (this INSERT is
-- encrypted at rest by Vault and never appears in any migration diff):
--
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
--
-- Replace <project-ref> below with this project's ref if it ever
-- changes (currently mbxwcjniiwcpiincpxba).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-task-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mbxwcjniiwcpiincpxba.supabase.co/functions/v1/send-task-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
