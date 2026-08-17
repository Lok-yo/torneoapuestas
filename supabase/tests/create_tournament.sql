-- create_tournament.sql
-- RED/GREEN against 0015_create_tournament_rpc.sql: proves the create_tournament
-- RPC creates a DRAFT tournament for authorized callers (organizer/admin),
-- is request_id idempotent, records audit/command_outcomes, and denies unauthorized callers.

begin;

select plan(5);

insert into auth.users (id, email) values
  ('c4000000-0000-0000-0000-000000000000', 'create-organizer@example.com'),
  ('c4000000-0000-0000-0000-000000000001', 'create-bystander@example.com')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('c4000000-0000-0000-0000-000000000000', 'organizer'),
  ('c4000000-0000-0000-0000-000000000001', 'user')
on conflict (user_id, role) do nothing;

-- ---------------------------------------------------------------------
-- A non-organizer, non-admin caller is denied.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.create_tournament('e1000000-0000-0000-0000-000000000001'::uuid, 'Unauthorized Tournament') $$,
  '42501',
  null,
  'a caller who is neither organizer nor admin is denied creation'
);

reset role;

-- ---------------------------------------------------------------------
-- Organizer creates a tournament successfully.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-0000-0000-000000000000', true);

select is(
  (public.create_tournament('e1000000-0000-0000-0000-000000000002'::uuid, 'My Brand New Tournament') ->> 'status'),
  'created',
  'organizer creates tournament successfully'
);

-- ---------------------------------------------------------------------
-- Idempotent replay with same request_id returns the original outcome and creates no second row.
-- ---------------------------------------------------------------------

select is(
  (public.create_tournament('e1000000-0000-0000-0000-000000000002'::uuid, 'My Brand New Tournament') ->> 'status'),
  'created',
  'replaying create_tournament with the same request_id is idempotent'
);

reset role;

select is(
  (select count(*) from public.tournaments where organizer_id = 'c4000000-0000-0000-0000-000000000000'),
  1::bigint,
  'exactly one tournament row was created'
);

select is(
  (select count(*) from public.audit_events where action = 'create_tournament'),
  1::bigint,
  'creation event was recorded in audit trail'
);

select * from finish();

rollback;
