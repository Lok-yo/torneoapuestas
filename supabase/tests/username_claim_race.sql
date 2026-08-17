-- username_claim_race.sql
-- RED (now GREEN against 0006_username_claim.sql): proves
-- claim_username is atomically unique case-insensitively, idempotent for
-- retried request_ids, and throttled past a threshold. See tasks.md 2.5
-- and authenticated-identity spec "Atomic case-insensitive username
-- claim" / "Repeated abuse".
--
-- True two-backend concurrency (two OS-level connections racing the same
-- statement) is out of scope for a single pgTAP transaction; what this
-- test proves instead is the mechanism that makes concurrent races safe
-- regardless of arrival order: the unique index on
-- profiles.username_normalized rejects the second writer no matter which
-- of two overlapping transactions commits first, so exactly one profile
-- ever ends up owning a given normalized username.

begin;

select plan(11);

insert into auth.users (id, email) values
  ('88888888-8888-8888-8888-888888888888', 'claim-a@example.com'),
  ('99999999-9999-9999-9999-999999999999', 'claim-b@example.com');

insert into public.profiles (user_id) values
  ('88888888-8888-8888-8888-888888888888'),
  ('99999999-9999-9999-9999-999999999999');

-- ---------------------------------------------------------------------
-- User A claims "Player1" and wins it.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888888';

select is(
  (public.claim_username('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Player1') ->> 'status'),
  'claimed',
  'user A claims Player1 successfully'
);

reset role;

-- ---------------------------------------------------------------------
-- User B claims "player1" — same normalized name, different case — and
-- must receive a stable conflict, never a duplicate owner.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';

select is(
  (public.claim_username('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'player1') ->> 'status'),
  'conflict',
  'user B is denied the case-variant collision (stable conflict, not error)'
);

reset role;

select is(
  (select count(*)::int from public.profiles where username_normalized = 'player1'),
  1,
  'exactly one profile owns the normalized username'
);

select is(
  (select user_id from public.profiles where username_normalized = 'player1'),
  '88888888-8888-8888-8888-888888888888'::uuid,
  'user A remains the sole owner after the collision attempt'
);

-- ---------------------------------------------------------------------
-- Idempotent replay: retrying user A's exact request_id must return the
-- original outcome without inserting a second command_outcomes row.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888888';

select is(
  (public.claim_username('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Player1') ->> 'status'),
  'claimed',
  'replaying the same request_id is idempotent (same claimed outcome)'
);

reset role;

select is(
  (select count(*)::int from public.command_outcomes where request_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  1,
  'exactly one command_outcomes row exists for the replayed request_id'
);

-- ---------------------------------------------------------------------
-- Unauthenticated / validation / throttle edges.
-- ---------------------------------------------------------------------

-- Clear the simulated JWT claim (not just the role) so auth.uid() is
-- genuinely null — "reset role" alone does not clear a "set local" GUC.
set local "request.jwt.claim.sub" = '';

select throws_ok(
  $$ select public.claim_username('cccccccc-0000-0000-0000-000000000003'::uuid, 'anything') $$,
  '28000',
  null,
  'unauthenticated caller (no session) is rejected'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';

select throws_ok(
  $$ select public.claim_username('dddddddd-0000-0000-0000-000000000004'::uuid, 'ab') $$,
  '22023',
  null,
  'too-short username is rejected at the command boundary (never recorded, so it does not spend a throttle slot)'
);

-- Exhaust the throttle threshold with well-formed (but colliding, hence
-- 'conflict') attempts, then prove the next attempt is a returned
-- 'rate_limited' status rather than a raised exception — the same
-- "stable, non-exceptional outcome" contract used for username
-- collisions, so the earlier attempts are never rolled back by a later
-- raise in this same call.
do $$
declare
  i int;
begin
  for i in 1..10 loop
    perform public.claim_username(gen_random_uuid(), 'player1');
  end loop;
end;
$$;

select is(
  (public.claim_username(gen_random_uuid(), 'somebrandnewname') ->> 'status'),
  'rate_limited',
  'repeated abuse from one actor is throttled past the configured threshold'
);

reset role;

select ok(
  exists (
    select 1 from public.audit_events
    where action = 'claim_username' and outcome = 'DENIED' and details ->> 'status' = 'rate_limited'
  ),
  'a throttled claim_username attempt is recorded in the audit trail'
);

select ok(
  exists (
    select 1 from public.audit_events
    where action = 'claim_username' and outcome = 'SUCCESS' and actor_id = '88888888-8888-8888-8888-888888888888'
  ),
  'the successful claim is recorded in the audit trail'
);

select * from finish();

rollback;
