-- lifecycle_rpc.sql
-- RED (now GREEN against 0008_lifecycle_rpc.sql): proves the tournament
-- lifecycle RPC — the real server-side authority mirrored by
-- src/domain/tournaments/lifecycle.js — is organizer/admin-only,
-- versioned (optimistic concurrency), audited, and rejects invalid
-- transitions without changing state. See tasks.md 3.3 and
-- tournament-operations spec "Validated tournament lifecycle".

begin;

select plan(8);

insert into auth.users (id, email) values
  ('a3000000-0000-0000-0000-000000000000', 'lifecycle-organizer@example.com'),
  ('a3000000-0000-0000-0000-000000000001', 'lifecycle-bystander@example.com');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, version)
values (
  'b3000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Lifecycle RPC Fixture',
  'DRAFT',
  1
);

-- ---------------------------------------------------------------------
-- A non-organizer, non-admin caller is denied.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.advance_tournament_state('f1000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'OPEN_REGISTRATION', 1) $$,
  '42501',
  null,
  'a caller who is neither the organizer nor an admin is denied'
);

reset role;

-- ---------------------------------------------------------------------
-- Organizer walks the happy path.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000000', true);

select is(
  (public.advance_tournament_state('f1000000-0000-0000-0000-000000000002'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'OPEN_REGISTRATION', 1) ->> 'newStatus'),
  'REGISTRATION_OPEN',
  'organizer opens registration'
);

-- ---------------------------------------------------------------------
-- A stale expected_version is a stable conflict, state unchanged.
-- ---------------------------------------------------------------------

select is(
  (public.advance_tournament_state('f1000000-0000-0000-0000-000000000003'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'CLOSE_REGISTRATION', 1) ->> 'status'),
  'version_conflict',
  'a stale expected_version is rejected as a stable conflict'
);

reset role;

select is(
  (select status from public.tournaments where id = 'b3000000-0000-0000-0000-000000000001'),
  'REGISTRATION_OPEN',
  'state is unchanged after the version-conflict attempt'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000000', true);

-- ---------------------------------------------------------------------
-- Skipping a state (REGISTRATION_OPEN straight to IN_PROGRESS) is
-- rejected as an invalid transition, not silently coerced.
-- ---------------------------------------------------------------------

select is(
  (public.advance_tournament_state('f1000000-0000-0000-0000-000000000004'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'START', 2) ->> 'status'),
  'invalid_transition',
  'skipping REGISTRATION_CLOSED is rejected'
);

select is(
  (public.advance_tournament_state('f1000000-0000-0000-0000-000000000005'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'CLOSE_REGISTRATION', 2) ->> 'newStatus'),
  'REGISTRATION_CLOSED',
  'organizer closes registration correctly with the fresh version'
);

reset role;

select is(
  (select roster_frozen_at is not null from public.tournaments where id = 'b3000000-0000-0000-0000-000000000001'),
  true,
  'closing registration also freezes the roster'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000000', true);

-- ---------------------------------------------------------------------
-- Idempotent replay of an already-applied transition.
-- ---------------------------------------------------------------------

select is(
  (public.advance_tournament_state('f1000000-0000-0000-0000-000000000005'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'CLOSE_REGISTRATION', 2) ->> 'newStatus'),
  'REGISTRATION_CLOSED',
  'replaying the same request_id returns the original outcome'
);

reset role;

select * from finish();

rollback;
