-- 0031_startgg_poller_cron.sql
-- Schedules startgg-poller to run automatically instead of relying on
-- manual curl invocations (it had none since it was built — see
-- design.md "Polling budget (~80 req/60s)": "recommended: pg_cron +
-- pg_net net.http_post on a 60s schedule"). pg_cron's minimum
-- granularity is 1 minute, so this runs every minute.
--
-- The cron secret (x-cron-secret) is read from Supabase Vault by name at
-- call time — never hardcoded here — so this file is safe to commit.
-- It must exist before this migration runs:
--   select vault.create_secret('<POLLER_CRON_SECRET value>', 'poller_cron_secret', '...');
-- The anon key below is not sensitive: it is already public, shipped in
-- the built frontend bundle (VITE_SUPABASE_ANON_KEY).
--
-- Rollback: `select cron.unschedule('startgg-poller-tick');`

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'startgg-poller-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://cvepivqkaksaymmqqyyu.supabase.co/functions/v1/startgg-poller',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZXBpdnFrYWtzYXltbXFxeXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzYzMDQsImV4cCI6MjEwMjA1MjMwNH0.5yPk26CKDeoJJc-ZVHEF7SzjlCVoE4he6AjZ7Gae_Ug',
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'poller_cron_secret')
    ),
    body := '{}'::jsonb,
    -- Slightly under the 60s cron interval: the poller itself keeps
    -- running server-side to completion even if pg_net gives up waiting
    -- (confirmed empirically: startgg_ingestion_cursor.last_completed_at
    -- updates well after this timeout would fire), so this bound only
    -- controls how long pg_net waits to record a response — it doesn't
    -- cut the actual poll short.
    timeout_milliseconds := 55000
  );
  $$
);
