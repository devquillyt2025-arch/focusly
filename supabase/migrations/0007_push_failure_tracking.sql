-- Tracks consecutive push-send failures per subscription so
-- send-task-reminders can stop retrying a permanently-broken endpoint that
-- doesn't return one of the standard revoked/expired codes (404/410/401/403)
-- — those are already deleted immediately. Everything else (5xx, timeouts,
-- malformed payload rejections) was retried every single cron run forever
-- with no way to ever stop.
alter table public.push_subscriptions
  add column consecutive_failures integer not null default 0;
