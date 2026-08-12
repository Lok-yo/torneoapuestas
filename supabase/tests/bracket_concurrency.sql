-- bracket_concurrency.sql
-- RED (now GREEN against 0010_bracket_rpc.sql): proves bracket generation
-- assigns every registered participant to exactly one first-round slot,
-- never fabricates a winner for later rounds, and that repeated/
-- concurrent generation for the same tournament produces one equivalent
-- bracket rather than a partial or duplicate graph. See tasks.md 3.9 and
-- tournament-operations spec "Bracket and match invariants".
--
-- True two-backend concurrency is out of scope for one pgTAP transaction
-- (same documented limitation as username_claim_race.sql /
-- roster_concurrency.sql). What actually makes a concurrent duplicate
-- call safe is generate_bracket locking the owning tournament row
-- (`for update`) before checking for an existing bracket: two
-- overlapping calls serialize on that lock, so the second one always
-- observes the first's already-committed bracket and returns
-- 'already_exists' instead of inserting a second graph. The repeated
-- calls below (same request_id, then a different one) exercise both the
-- idempotent-replay path and that serialized "already exists" path.

begin;

select plan(11);

insert into auth.users (id, email)
select gen_random_uuid(), 'bracket-user-' || n || '@example.com'
from generate_series(1, 8) as n;

create temporary table bracket_test_users as
select row_number() over (order by email) as n, id
from auth.users
where email like 'bracket-user-%@example.com';

grant select on bracket_test_users to authenticated;

insert into public.profiles (user_id) select id from bracket_test_users;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000000', 'bracket-organizer@example.com');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, roster_frozen_at)
values (
  'b1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Bracket Concurrency Fixture',
  'REGISTRATION_CLOSED',
  now()
);

insert into public.memberships (tournament_id, user_id, status)
select 'b1000000-0000-0000-0000-000000000001', id, 'REGISTERED'
from bracket_test_users;

-- ---------------------------------------------------------------------
-- A non-organizer, non-admin caller is denied.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from bracket_test_users where n = 1), true);

select throws_ok(
  $$ select public.generate_bracket('d0000000-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  null,
  'a participant (not the organizer or an admin) cannot generate the bracket'
);

reset role;

-- ---------------------------------------------------------------------
-- The organizer generates the bracket.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000000', true);

select is(
  (public.generate_bracket('d0000000-0000-0000-0000-000000000002'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'created',
  'the organizer generates the bracket successfully'
);

reset role;

select is(
  (select count(*)::int from public.brackets where tournament_id = 'b1000000-0000-0000-0000-000000000001'),
  1,
  'exactly one bracket exists for the tournament'
);

select is(
  (select count(*)::int from public.matches where tournament_id = 'b1000000-0000-0000-0000-000000000001'),
  7,
  'the bracket has exactly 7 matches (4 + 2 + 1) for an 8-participant single-elimination format'
);

select is(
  (select count(*)::int from public.matches where tournament_id = 'b1000000-0000-0000-0000-000000000001' and round = 1),
  4,
  'round 1 has exactly 4 matches'
);

select is(
  (
    select count(distinct m)::int
    from public.matches, lateral (values (participant_a_membership_id), (participant_b_membership_id)) as m(m)
    where tournament_id = 'b1000000-0000-0000-0000-000000000001' and round = 1
  ),
  8,
  'every one of the 8 registered participants is assigned to exactly one round-1 slot'
);

select is(
  (
    select count(*)::int from public.matches
    where tournament_id = 'b1000000-0000-0000-0000-000000000001'
      and round > 1
      and (participant_a_membership_id is not null or participant_b_membership_id is not null)
  ),
  0,
  'no round-2+ match has a fabricated participant/winner'
);

select is(
  (
    select count(*)::int from public.matches
    where tournament_id = 'b1000000-0000-0000-0000-000000000001' and round = 1 and status = 'READY'
  ),
  4,
  'every round-1 match is READY (both participants known)'
);

-- ---------------------------------------------------------------------
-- Idempotent replay: retrying the exact same request_id returns the same
-- outcome without touching the bracket.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000000', true);

select is(
  (public.generate_bracket('d0000000-0000-0000-0000-000000000002'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'created',
  'replaying the same request_id returns the original outcome'
);

-- ---------------------------------------------------------------------
-- A genuinely repeated call (different request_id) for a tournament that
-- already has a bracket is the serialized "already exists" path — this
-- is what protects a real concurrent second caller too.
-- ---------------------------------------------------------------------

select is(
  (public.generate_bracket('d0000000-0000-0000-0000-000000000003'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'already_exists',
  'a repeated generation call for an already-generated tournament preserves the existing bracket'
);

reset role;

select is(
  (select count(*)::int from public.brackets where tournament_id = 'b1000000-0000-0000-0000-000000000001'),
  1,
  'still exactly one bracket after replay and repeat attempts — no partial or duplicate graph'
);

select * from finish();

rollback;
