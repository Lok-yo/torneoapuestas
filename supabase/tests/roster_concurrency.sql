-- roster_concurrency.sql
-- RED (now GREEN against 0009_registration_rpc.sql): proves eligibility,
-- membership uniqueness (including safe re-registration after a prior
-- withdrawal), roster-capacity enforcement, and freeze rules. See
-- tasks.md 3.6 and tournament-operations spec "Registration and roster
-- freeze".
--
-- True two-backend concurrency is out of scope for one pgTAP transaction
-- (same documented limitation as username_claim_race.sql). What actually
-- makes a concurrent duplicate registration safe is register_participant
-- locking the owning tournament row (`for update`) before reading
-- membership state: two overlapping calls serialize on that lock
-- regardless of arrival order, so the second one always observes the
-- first's already-committed membership and returns a stable
-- 'already_registered'/'roster_full' outcome rather than a second row.
-- Sequential calls below exercise exactly that serialized code path.

begin;

select plan(13);

insert into auth.users (id, email)
select gen_random_uuid(), 'roster-user-' || n || '@example.com'
from generate_series(1, 10) as n;

-- Stash the 10 generated user ids in an order-stable temp table so each
-- assertion below can address a specific participant by position.
create temporary table roster_test_users as
select row_number() over (order by email) as n, id
from auth.users
where email like 'roster-user-%@example.com';

-- Grant read access so assertions below can look up a participant's id
-- after switching to the `authenticated` role (which does not own this
-- temp table).
grant select on roster_test_users to authenticated;

insert into public.profiles (user_id)
select id from roster_test_users;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'roster-organizer@example.com');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status)
values (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Roster Concurrency Fixture',
  'REGISTRATION_OPEN'
);

-- ---------------------------------------------------------------------
-- Eligible registration for user 1.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 1), true);

select is(
  (public.register_participant('c0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'registered',
  'eligible user registers successfully'
);

reset role;

select is(
  (select count(*)::int from public.memberships where tournament_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'exactly one membership exists after the first registration'
);

-- ---------------------------------------------------------------------
-- Duplicate registration (different request_id, same user) is a stable
-- conflict, not a second row — the invariant that also protects a
-- genuinely concurrent duplicate attempt.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 1), true);

select is(
  (public.register_participant('c0000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'already_registered',
  'duplicate registration is rejected with a stable conflict'
);

reset role;

select is(
  (select count(*)::int from public.memberships where tournament_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'membership count is unchanged after the duplicate attempt'
);

-- ---------------------------------------------------------------------
-- Withdrawal before freeze, then re-registration reuses the same row
-- (unique (tournament_id, user_id) — never a second membership).
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 1), true);

select is(
  (public.withdraw_participant('c0000000-0000-0000-0000-000000000003'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'withdrawn',
  'registered user withdraws successfully before freeze'
);

select is(
  (public.withdraw_participant('c0000000-0000-0000-0000-000000000004'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'not_registered',
  'withdrawing again with no active registration is rejected'
);

select is(
  (public.register_participant('c0000000-0000-0000-0000-000000000005'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'registered',
  'the same user can re-register after withdrawing'
);

reset role;

select is(
  (select count(*)::int from public.memberships where tournament_id = 'b0000000-0000-0000-0000-000000000001' and user_id = (select id from roster_test_users where n = 1)),
  1,
  're-registration reuses the same membership row instead of inserting a second one'
);

-- ---------------------------------------------------------------------
-- Fill the roster to its 8-participant capacity, then prove a 9th
-- registration is rejected while registration is still open.
-- ---------------------------------------------------------------------

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select id from roster_test_users where n between 2 and 8 order by n loop
    perform set_config('request.jwt.claim.sub', v_user_id::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.register_participant(gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001'::uuid);
  end loop;
end;
$$;

reset role;

select is(
  (select count(*)::int from public.memberships where tournament_id = 'b0000000-0000-0000-0000-000000000001' and status = 'REGISTERED'),
  8,
  'roster reaches its configured 8-participant capacity'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 9), true);

select is(
  (public.register_participant('c0000000-0000-0000-0000-000000000006'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'roster_full',
  'a 9th registration is rejected once the roster is at capacity'
);

reset role;

-- ---------------------------------------------------------------------
-- Close registration (organizer) — this freezes the roster.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000000', true);

select is(
  (public.advance_tournament_state('c0000000-0000-0000-0000-000000000007'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'CLOSE_REGISTRATION', 1) ->> 'status'),
  'transitioned',
  'organizer closes registration, freezing the roster'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 9), true);

select is(
  (public.register_participant('c0000000-0000-0000-0000-000000000008'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'closed',
  'registration after the roster is frozen is rejected'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from roster_test_users where n = 1), true);

select is(
  (public.withdraw_participant('c0000000-0000-0000-0000-000000000009'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'frozen',
  'withdrawal after the roster is frozen is rejected'
);

reset role;

select * from finish();

rollback;
