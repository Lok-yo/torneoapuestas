# Postgres / pgTAP test harness

This directory holds `pgTAP`-based database tests that run against a local
Supabase Postgres instance started by the Supabase CLI.

## Running

```bash
npm run test:db
```

This wraps `supabase test db`, which:

1. Starts (or reuses) the local Supabase stack defined in `supabase/config.toml`.
2. Resets the local database and replays every migration in
   `supabase/migrations/` in filename order.
3. Runs every `*.sql` test file in this directory with `pgTAP` assertions.

## Conventions

- One file per invariant under test, named after the behavior it proves
  (e.g. `rls_deny_by_default.sql`, `username_claim_race.sql`).
- Each test file starts with `BEGIN;` and `SELECT plan(N);` and ends with
  `SELECT * FROM finish(); ROLLBACK;` so tests never leave residue in the
  database.
- RED tests are written and committed before the migration/RPC that makes
  them pass, per the project's TDD/threat-matrix conventions (see
  `openspec/changes/production-ready-tournament-betting-platform/design.md`).
- Tests assume `pgtap` extension is available; enable it once per database
  with `create extension if not exists pgtap;` (handled by
  `supabase/migrations/0000_extensions.sql`).

## Requirements

- Docker (used by the Supabase CLI to run local Postgres/Auth/Storage).
- `supabase` CLI, available via `npx supabase` (declared as a devDependency
  in `package.json`, no global install required).
