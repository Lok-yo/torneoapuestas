-- migration_audit.sql
-- RED (now GREEN against 0014_migration_audit.sql): proves the
-- migration_events audit trail is append-only, admin-read-only, and
-- writable only via record_migration_event() -- never a direct client
-- table write. Closes the legacy-migration-controls spec gap flagged
-- during the Phase 5 deferral review ("Migration audit and rollback
-- evidence" was previously unimplemented). See tasks.md 5.4.

begin;

select plan(12);

insert into auth.users (id, email) values
  ('f4000000-0000-0000-0000-000000000001', 'migaudit-admin@example.com'),
  ('f4000000-0000-0000-0000-000000000002', 'migaudit-user@example.com');

insert into public.user_roles (user_id, role) values
  ('f4000000-0000-0000-0000-000000000001', 'admin');

-- ---------------------------------------------------------------------
-- anon can call the RPC (an adapter can fail before any session exists,
-- e.g. the identity adapter itself), and actor_id is null for it.
-- ---------------------------------------------------------------------

set local role anon;

select is(
  (select (public.record_migration_event('ADAPTER_ERROR', 'identity', '{"reason":"dependency_unavailable"}'::jsonb) ->> 'status')),
  'recorded',
  'anon can record an adapter-error event'
);

select throws_ok(
  $$ select 1 from public.migration_events $$,
  '42501',
  null,
  'anon is denied (permission error) reading migration_events directly'
);

reset role;

-- ---------------------------------------------------------------------
-- authenticated non-admin can call the RPC (its own actor_id is
-- attributed), but cannot read the table at all -- admin-only.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'f4000000-0000-0000-0000-000000000002';

select is(
  (select (public.record_migration_event('FLAG_CHANGE', 'tournaments', '{"reason":"flag_disabled"}'::jsonb) ->> 'status')),
  'recorded',
  'authenticated non-admin can record a flag-change event'
);

select is_empty(
  $$ select 1 from public.migration_events $$,
  'authenticated non-admin sees no rows in migration_events (admin-only read)'
);

select throws_ok(
  $$ update public.migration_events set detail = '{}'::jsonb $$,
  '42501',
  null,
  'authenticated non-admin cannot update migration_events (append-only)'
);

reset role;

-- ---------------------------------------------------------------------
-- admin reads every recorded event, including the anon- and
-- non-admin-attributed ones above; actor_id attribution is correct.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'f4000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.migration_events),
  2,
  'admin reads both previously recorded events'
);

select is(
  (select count(*)::int from public.migration_events where actor_id is null and event_type = 'ADAPTER_ERROR'),
  1,
  'the anon-originated event has a null actor_id'
);

select is(
  (select actor_id from public.migration_events where event_type = 'FLAG_CHANGE'),
  'f4000000-0000-0000-0000-000000000002',
  'the authenticated-originated event is attributed to its actor'
);

select throws_ok(
  $$ update public.migration_events set detail = '{}'::jsonb $$,
  '42501',
  null,
  'admin cannot update migration_events either -- no UPDATE grant to any client role'
);

select throws_ok(
  $$ delete from public.migration_events $$,
  '42501',
  null,
  'admin cannot delete migration_events either -- no DELETE grant to any client role'
);

reset role;

-- ---------------------------------------------------------------------
-- Invalid input is rejected before anything is recorded.
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select public.record_migration_event('NOT_A_REAL_TYPE', 'identity', '{}'::jsonb) $$,
  '23514',
  null,
  'an unrecognized event_type is rejected by the check constraint'
);

select throws_ok(
  $$ select public.record_migration_event('ADAPTER_ERROR', 'identity', jsonb_build_object('big', repeat('x', 3000))) $$,
  '23514',
  null,
  'an oversized detail payload is rejected by the bounded-size check constraint'
);

select * from finish();

rollback;
