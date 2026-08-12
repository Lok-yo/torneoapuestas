-- rating_projection.sql
-- RED (now GREEN against 0012_rating_projector_trigger.sql /
-- 0013_correction_rpc.sql): proves an accepted official result
-- deterministically projects into versioned rating_events/rating_snapshots,
-- that the projection is idempotent under a retried request, and that
-- correct_result enforces authority/reason, marks conflicting versions for
-- review without silently resolving them, and — on an authorized
-- correction — appends a new version while preserving the prior result and
-- its rating events untouched. See tasks.md 4.2/4.4/4.5/4.6 and
-- rating-projections spec "Official-result rating events" / "Deterministic
-- and retry-safe processing" / "Correction and historical auditability".

begin;

select plan(16);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000000', 'rating-organizer@example.com'),
  ('a5000000-0000-0000-0000-000000000001', 'rating-player-a@example.com'),
  ('a5000000-0000-0000-0000-000000000002', 'rating-player-b@example.com'),
  ('a5000000-0000-0000-0000-000000000003', 'rating-bystander@example.com');

insert into public.profiles (user_id) values
  ('a5000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002'),
  ('a5000000-0000-0000-0000-000000000003');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, roster_frozen_at)
values (
  'b5000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Rating Projection Fixture',
  'IN_PROGRESS',
  now()
);

insert into public.memberships (id, tournament_id, user_id, status) values
  ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'REGISTERED'),
  ('c5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'REGISTERED');

insert into public.brackets (id, tournament_id, format_id)
values ('d5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

insert into public.matches (id, bracket_id, tournament_id, round, slot, participant_a_membership_id, participant_b_membership_id, status)
values ('e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 1, 0, 'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'READY');

-- ---------------------------------------------------------------------
-- Accepted official result projects exactly two rating events and two
-- recomputed snapshots.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000000', true);

select is(
  (public.submit_official_result('f5000000-0000-0000-0000-000000000001'::uuid, 'e5000000-0000-0000-0000-000000000001'::uuid, 2, 0) ->> 'status'),
  'accepted',
  'the organizer submits a valid 2-0 official result'
);

reset role;

select is(
  (select count(*)::int from public.rating_events re join public.results r on r.match_id = 'e5000000-0000-0000-0000-000000000001' and r.status = 'OFFICIAL' where re.result_id = r.id),
  2,
  'exactly two rating events (winner + loser) were projected from the official result'
);

-- Captured as the superuser test runner (not under any RLS restriction) so
-- later steps that run as an unauthorized/uninvolved caller can still pass
-- the real result_id into correct_result — an RLS-restricted subquery would
-- return null for a bystander and mask the intended authorization test.
select id as result_id from public.results where match_id = 'e5000000-0000-0000-0000-000000000001' and status = 'OFFICIAL' \gset

select is(
  (select rs.rating from public.rating_snapshots rs where rs.user_id = 'a5000000-0000-0000-0000-000000000001' and rs.game_id = 'ssbu'),
  1025::numeric,
  'the winner''s snapshot recomputed to base 1000 + WIN_DELTA 25'
);

select is(
  (select rs.rating from public.rating_snapshots rs where rs.user_id = 'a5000000-0000-0000-0000-000000000002' and rs.game_id = 'ssbu'),
  975::numeric,
  'the loser''s snapshot recomputed to base 1000 - 25'
);

-- ---------------------------------------------------------------------
-- Idempotent replay of the same request never duplicates the projection.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000000', true);

select is(
  (public.submit_official_result('f5000000-0000-0000-0000-000000000001'::uuid, 'e5000000-0000-0000-0000-000000000001'::uuid, 2, 0) ->> 'status'),
  'accepted',
  'replaying the same request_id returns the original outcome'
);

reset role;

select is(
  (select count(*)::int from public.rating_events re join public.results r on r.match_id = 'e5000000-0000-0000-0000-000000000001' and r.status = 'OFFICIAL' where re.result_id = r.id),
  2,
  'the replay produced no duplicate rating events (still exactly two)'
);

-- ---------------------------------------------------------------------
-- correct_result: unauthorized bystander is denied.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000003', true);

-- psql does not interpolate :'variables' inside a $$ dollar-quoted string,
-- so the dynamic query text is built with format()/%L outside the quoting
-- instead, keeping the real captured result_id in the unauthorized-caller
-- probe rather than a literal, unsubstituted ":'result_id'" token.
select throws_ok(
  format(
    'select public.correct_result(%L::uuid, %L::uuid, 1, 1, 2, %L)',
    'f5000000-0000-0000-0000-000000000002', :'result_id', 'not authorized'
  ),
  '42501',
  null,
  'a caller with no organizer/referee/admin authority cannot correct a result'
);

reset role;

-- ---------------------------------------------------------------------
-- correct_result: a reason is required.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000000', true);

select is(
  (public.correct_result('f5000000-0000-0000-0000-000000000003'::uuid, :'result_id', 1, 1, 2, '') ->> 'status'),
  'reason_required',
  'an omitted/blank correction reason is rejected'
);

reset role;

select is(
  (select count(*)::int from public.results where match_id = 'e5000000-0000-0000-0000-000000000001'),
  1,
  'the reason-less correction attempt inserted no new result row'
);

-- ---------------------------------------------------------------------
-- correct_result: a stale expected_version is a conflicting source
-- version — rejected, existing evidence preserved, marked for review.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000000', true);

select is(
  (public.correct_result('f5000000-0000-0000-0000-000000000004'::uuid, :'result_id', 99, 1, 2, 'stale version probe') ->> 'status'),
  'version_conflict',
  'a stale expected_version is rejected as a conflicting source version, not silently resolved'
);

reset role;

select is(
  (select count(distinct review_state)::int from public.rating_events re join public.results r on r.id = re.result_id where r.match_id = 'e5000000-0000-0000-0000-000000000001'),
  1,
  'the conflict marks the existing rating events for review'
);

select is(
  (select review_state from public.rating_events re join public.results r on r.id = re.result_id where r.match_id = 'e5000000-0000-0000-0000-000000000001' limit 1),
  'NEEDS_REVIEW',
  'the review-state flag is specifically NEEDS_REVIEW after the conflict'
);

-- ---------------------------------------------------------------------
-- correct_result: an authorized correction with the correct expected
-- version appends a new version, flips the winner, and preserves the
-- original result + its rating events untouched (never erased).
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000000', true);

select is(
  (public.correct_result('f5000000-0000-0000-0000-000000000005'::uuid, :'result_id', 1, 1, 2, 'referee review: scoring error corrected') ->> 'status'),
  'corrected',
  'the authorized correction with the correct expected_version is accepted'
);

reset role;

select is(
  (select count(*)::int from public.results where match_id = 'e5000000-0000-0000-0000-000000000001' and status = 'CORRECTED'),
  1,
  'the original result is superseded (status CORRECTED), never deleted'
);

select is(
  (select games_won_a from public.results where match_id = 'e5000000-0000-0000-0000-000000000001' and status = 'CORRECTED'),
  2,
  'the original (now-superseded) result still carries its original evidence unchanged'
);

select is(
  (select rs.user_id from public.rating_snapshots rs where rs.game_id = 'ssbu' and rs.rating = 1025::numeric),
  'a5000000-0000-0000-0000-000000000002'::uuid,
  'after the correction flips the winner, the snapshot leaderboard reflects the new outcome deterministically'
);

select * from finish();

rollback;
