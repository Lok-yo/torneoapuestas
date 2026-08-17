-- migration_retry_idempotency.sql
-- GREEN suite for 0021_verify_remediation.sql (B): proves the
-- legacy-migration-controls spec "Migration audit and rollback
-- evidence" scenario "Retry or concurrent migration" — the same
-- migration step replayed with the same request_id is recorded at most
-- once, replays return the original record, distinct steps stay
-- distinct, and the previously writer-less ROLLBACK/RECONCILIATION
-- event types are recordable through the RPC.

begin;

select plan(8);

insert into auth.users (id, email) values
  ('f6000000-0000-0000-0000-000000000001', 'migretry-admin@example.com'),
  ('f6000000-0000-0000-0000-000000000002', 'migretry-user@example.com');

insert into public.user_roles (user_id, role) values
  ('f6000000-0000-0000-0000-000000000001', 'admin');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------
-- Same step retried with the same request_id -> exactly one row; the
-- replay returns the ORIGINAL id and is flagged as an idempotent
-- replay.
-- ---------------------------------------------------------------------

select is(
  (select public.record_migration_event(
     'FLAG_CHANGE', 'tournaments',
     '{"reason":"flag_disabled"}'::jsonb,
     'a1000000-0000-0000-0000-000000000001'
   ) ->> 'status'),
  'recorded',
  'first call with a request_id records'
);

select is(
  (select public.record_migration_event(
     'FLAG_CHANGE', 'tournaments',
     '{"reason":"flag_disabled"}'::jsonb,
     'a1000000-0000-0000-0000-000000000001'
   ) ->> 'idempotent_replay'),
  'true',
  'replay of the same request_id is flagged as an idempotent replay'
);

-- Row-count assertions run as admin: migration_events is admin-read-only
-- (RLS), so the non-admin session above correctly cannot see the rows it
-- just recorded through the SECURITY DEFINER RPC.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.migration_events where request_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'retried migration step is recorded at most once'
);

select is(
  (select (public.record_migration_event(
     'FLAG_CHANGE', 'tournaments',
     '{"reason":"flag_disabled"}'::jsonb,
     'a1000000-0000-0000-0000-000000000001'
   ) ->> 'id') = (select id::text from public.migration_events where request_id = 'a1000000-0000-0000-0000-000000000001')),
  true,
  'replay returns the original record id (auditable continuity)'
);

-- ---------------------------------------------------------------------
-- Distinct steps (distinct request_ids) stay distinct; legacy call
-- shape (null request_id) still records.
-- ---------------------------------------------------------------------

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000002';

select public.record_migration_event(
  'ADAPTER_ERROR', 'identity',
  '{"reason":"dependency_unavailable"}'::jsonb,
  'a1000000-0000-0000-0000-000000000002'
);

select public.record_migration_event(
  'ADAPTER_ERROR', 'identity',
  '{"reason":"dependency_unavailable"}'::jsonb
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.migration_events),
  3,
  'distinct steps record separately; legacy null-request_id calls still record'
);

-- ---------------------------------------------------------------------
-- ROLLBACK and RECONCILIATION are recordable through the same RPC
-- (previously they existed only in the schema check constraint, with no
-- writer).
-- ---------------------------------------------------------------------

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000002';

select is(
  (select public.record_migration_event(
     'ROLLBACK', 'ratings',
     '{"reason":"integrity_incident","to":"previous_verified_path"}'::jsonb,
     'a1000000-0000-0000-0000-000000000003'
   ) ->> 'status'),
  'recorded',
  'ROLLBACK events are recordable through the RPC'
);

select is(
  (select public.record_migration_event(
     'RECONCILIATION', 'ratings',
     '{"reason":"post_rollback_reconcile","records":0}'::jsonb,
     'a1000000-0000-0000-0000-000000000004'
   ) ->> 'status'),
  'recorded',
  'RECONCILIATION events are recordable through the RPC'
);

reset role;

-- ---------------------------------------------------------------------
-- Admin can audit the full retry history: attribution and final
-- reconciled state are visible in one place.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.migration_events),
  5,
  'admin sees the complete audited migration history (at-most-once, attributed)'
);

reset role;

select * from finish();
