-- settlement-tick-cron.sql (NOT a migration — see below)
--
-- VPS-day pg_cron job for the settlement pipeline, mirroring
-- supabase/migrations/0031_startgg_poller_cron.sql verbatim (pg_cron +
-- pg_net net.http_post on a schedule, cron secret read from Supabase
-- Vault by name at call time — never hardcoded here, so this file is
-- safe to commit). See design.md "cron SQL ships outside
-- supabase/migrations/" and spec "Cron-Ready Documentation".
--
-- WHY THIS LIVES OUTSIDE supabase/migrations/ TODAY:
-- Supabase cloud Edge Functions cannot reach the developer's local Anvil
-- node (127.0.0.1:8545) — see design.md "Local Execution Mode". Applying
-- this as a migration today would schedule a cron job that calls a
-- settlement-tick Edge Function which either doesn't exist yet or can't
-- reach a real RPC. A 100%-commented migration would still be recorded
-- as applied, and uncommenting it later never re-runs and breaks the
-- migration history checksum (design.md "Decision: cron SQL ships
-- outside supabase/migrations/"). So this file stays inert until the VPS
-- activation step below.
--
-- ---------------------------------------------------------------------
-- VPS ACTIVATION (once the project runs on a VPS with a publicly
-- reachable Anvil/RPC endpoint):
--
-- 1. Port scripts/settlement/tick.mjs's runTick(deps) into a Supabase
--    Edge Function, e.g. supabase/functions/settlement-tick/index.ts,
--    as `Deno.serve(() => runTick({ db, publicClient, walletClient,
--    addresses, now }))` — same function, swapped Deno-esm.sh imports
--    for viem/supabase-js, same as relayer/index.ts already does. No
--    rewrite of the settlement logic itself (design.md "Future cron
--    activation is a config change, not a rewrite").
-- 2. Create the cron secret in Supabase Vault (mirrors 0031's
--    poller_cron_secret):
--      select vault.create_secret('<SETTLEMENT_CRON_SECRET value>', 'settlement_cron_secret', '...');
-- 3. Update the project-ref URL and anon key below if they changed.
-- 4. Copy this file to supabase/migrations/0032_settlement_cron.sql and
--    run `supabase db push`.
--
-- Rollback: `select cron.unschedule('settlement-tick');`
-- ---------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'settlement-tick',
  '* * * * *', -- pg_cron's minimum granularity is 1 minute; the settlement-tick
               -- function itself may no-op most ticks (nothing eligible) — cheap by design.
  $$
  select net.http_post(
    url := 'https://cvepivqkaksaymmqqyyu.supabase.co/functions/v1/settlement-tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZXBpdnFrYWtzYXltbXFxeXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzYzMDQsImV4cCI6MjEwMjA1MjMwNH0.5yPk26CKDeoJJc-ZVHEF7SzjlCVoE4he6AjZ7Gae_Ug',
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'settlement_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
