-- public_projection.sql
-- RED (now GREEN against the "select_published" policies added to
-- 0004_rls_policies.sql): proves an anonymous, unauthenticated caller can
-- read a published tournament's bracket/matches/results (the public,
-- non-financial projection) but still cannot read a DRAFT tournament's
-- bracket, and still cannot read any private table (profiles,
-- memberships). See tournament-operations spec "Public projection and
-- closed perimeter".
--
-- This closes a real gap found while wiring the UI in this batch:
-- public_brackets_view (0005) is security_invoker, so without an explicit
-- anon-readable policy on the underlying brackets/matches/results tables,
-- an anonymous reader got a permission error instead of the published
-- projection — silently failing the very requirement this view exists
-- to satisfy.

begin;

select plan(7);

insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000000', 'projection-organizer@example.com'),
  ('a4000000-0000-0000-0000-000000000001', 'projection-player-a@example.com'),
  ('a4000000-0000-0000-0000-000000000002', 'projection-player-b@example.com');

insert into public.profiles (user_id) values
  ('a4000000-0000-0000-0000-000000000001'),
  ('a4000000-0000-0000-0000-000000000002');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status)
values (
  'b4000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Published Projection Fixture',
  'IN_PROGRESS'
),
(
  'b4000000-0000-0000-0000-000000000002',
  'a4000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Draft Projection Fixture',
  'DRAFT'
);

insert into public.memberships (id, tournament_id, user_id, status) values
  ('c4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'REGISTERED'),
  ('c4000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'REGISTERED');

insert into public.brackets (id, tournament_id, format_id) values
  ('d4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('d4000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');

insert into public.matches (id, bracket_id, tournament_id, round, slot, participant_a_membership_id, participant_b_membership_id, status)
values
  ('e4000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 1, 0, 'c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002', 'COMPLETED'),
  ('e4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000002', 1, 0, null, null, 'PENDING');

insert into public.results (match_id, games_won_a, games_won_b, winner_membership_id, submitted_by, ruleset_version, request_id)
values ('e4000000-0000-0000-0000-000000000001', 2, 0, 'c4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000000', 1, gen_random_uuid());

-- ---------------------------------------------------------------------
-- Anonymous reads of the published tournament's projection succeed.
-- ---------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.public_tournaments_view where id = 'b4000000-0000-0000-0000-000000000001'),
  1,
  'anon reads the published tournament via the public view'
);

select is(
  (select count(*)::int from public.public_brackets_view where tournament_id = 'b4000000-0000-0000-0000-000000000001'),
  1,
  'anon reads the published bracket/match projection'
);

select is(
  (select games_won_a from public.public_brackets_view where tournament_id = 'b4000000-0000-0000-0000-000000000001'),
  2,
  'anon sees the official score in the public projection'
);

-- ---------------------------------------------------------------------
-- The DRAFT tournament's bracket is not exposed to anon.
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.public_brackets_view where tournament_id = 'b4000000-0000-0000-0000-000000000002'),
  0,
  'anon cannot read a DRAFT tournament''s bracket'
);

select is(
  (select count(*)::int from public.public_tournaments_view where id = 'b4000000-0000-0000-0000-000000000002'),
  0,
  'anon cannot read a DRAFT tournament via the public view'
);

-- ---------------------------------------------------------------------
-- Private tables remain fully denied to anon regardless of publication.
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select 1 from public.profiles $$,
  '42501',
  null,
  'anon is still denied (permission error) on profiles'
);

select throws_ok(
  $$ select 1 from public.memberships $$,
  '42501',
  null,
  'anon is still denied (permission error) on memberships'
);

reset role;

select * from finish();

rollback;
