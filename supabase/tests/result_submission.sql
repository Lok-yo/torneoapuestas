-- result_submission.sql
-- RED (now GREEN against 0011_result_rpc.sql): proves official-result
-- authority (organizer/referee/admin only — a database grant, never a
-- client/JWT claim), the best-of-3 score schema, idempotent replay, and
-- that a completed match cannot be silently overwritten by a repeat
-- submission. Also proves the winner is propagated into the next bracket
-- match without ever fabricating a result. See tasks.md 3.11 and
-- tournament-operations spec "Official result authority".

begin;

select plan(9);

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000000', 'result-organizer@example.com'),
  ('a2000000-0000-0000-0000-000000000001', 'result-player-a@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'result-player-b@example.com'),
  ('a2000000-0000-0000-0000-000000000003', 'result-bystander@example.com');

insert into public.profiles (user_id)
values
  ('a2000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002'),
  ('a2000000-0000-0000-0000-000000000003');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, roster_frozen_at)
values (
  'b2000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Result Submission Fixture',
  'IN_PROGRESS',
  now()
);

insert into public.memberships (id, tournament_id, user_id, status) values
  ('c2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'REGISTERED'),
  ('c2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'REGISTERED');

insert into public.brackets (id, tournament_id, format_id)
values ('d2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

-- Final match (round 2) participants unknown until round 1 completes.
insert into public.matches (id, bracket_id, tournament_id, round, slot, participant_a_membership_id, participant_b_membership_id, next_match_id, next_match_slot, status)
values ('e2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 2, 0, null, null, null, null, 'PENDING');

-- Round-1 match feeding its winner into the final's slot A.
insert into public.matches (id, bracket_id, tournament_id, round, slot, participant_a_membership_id, participant_b_membership_id, next_match_id, next_match_slot, status)
values ('e2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 1, 0, 'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'A', 'READY');

-- ---------------------------------------------------------------------
-- Unauthorized bystander (not organizer/referee/admin) is denied.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$ select public.submit_official_result('f0000000-0000-0000-0000-000000000001'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 2, 0) $$,
  '42501',
  null,
  'a caller with no organizer/referee/admin authority is denied'
);

reset role;

-- ---------------------------------------------------------------------
-- Organizer submits an invalid best-of-3 score (2-2 is not reachable).
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000000', true);

select is(
  (public.submit_official_result('f0000000-0000-0000-0000-000000000002'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 2, 2) ->> 'status'),
  'invalid_score',
  'an impossible best-of-3 score (2-2) is rejected'
);

-- ---------------------------------------------------------------------
-- Organizer submits a valid 2-0 result.
-- ---------------------------------------------------------------------

select is(
  (public.submit_official_result('f0000000-0000-0000-0000-000000000003'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 2, 0) ->> 'status'),
  'accepted',
  'a valid 2-0 result is accepted from the organizer'
);

reset role;

select is(
  (select status from public.matches where id = 'e2000000-0000-0000-0000-000000000001'),
  'COMPLETED',
  'the match is marked COMPLETED after the official result'
);

select is(
  (select winner_membership_id from public.results where match_id = 'e2000000-0000-0000-0000-000000000001'),
  'c2000000-0000-0000-0000-000000000001'::uuid,
  'the result records the correct winner (participant A, who reached 2 wins)'
);

select is(
  (select participant_a_membership_id from public.matches where id = 'e2000000-0000-0000-0000-000000000002'),
  'c2000000-0000-0000-0000-000000000001'::uuid,
  'the winner is propagated into the next match''s slot A — never fabricated, only ever the real winner'
);

-- ---------------------------------------------------------------------
-- Repeated/stale submission for the now-completed match is rejected,
-- never silently overwritten.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000000', true);

select is(
  (public.submit_official_result('f0000000-0000-0000-0000-000000000004'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 0, 2) ->> 'status'),
  'not_completable',
  'a repeated result submission for an already-completed match is rejected, not silently overwritten'
);

reset role;

select is(
  (select count(*)::int from public.results where match_id = 'e2000000-0000-0000-0000-000000000001'),
  1,
  'exactly one official result exists — the repeat attempt never inserted a second row'
);

-- ---------------------------------------------------------------------
-- Idempotent replay of the original successful request_id.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000000', true);

select is(
  (public.submit_official_result('f0000000-0000-0000-0000-000000000003'::uuid, 'e2000000-0000-0000-0000-000000000001'::uuid, 2, 0) ->> 'status'),
  'accepted',
  'replaying the original request_id returns the original accepted outcome'
);

reset role;

select * from finish();

rollback;
