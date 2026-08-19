-- tournament_sets.sql
-- RED (now GREEN against 0025_tournament_sets_and_market_set_key.sql).
-- Proves the TOP-8 set-betting schema invariants (see bracket-top8-betting
-- design "Schema and Migration" and tasks.md 1.4):
--   1. RLS + grants block anon/authenticated writes to tournament_sets
--      (service-role-only ingestion).
--   2. public_tournament_sets_view hides phase_id and raw entrant/winner
--      ids while exposing winner_name (public bracket knowledge) and
--      market_question_id (existing-market link target).
--   3. The partial unique index onchain_markets_live_set_uniq rejects a
--      second live market on the same set, but allows VOID markets on the
--      same set and legacy NULL-key rows.

begin;

select plan(15);

-- ---------------------------------------------------------------------
-- Fixtures: one tournament, three TOP-8 sets (completed, pending, bye),
-- plus a live market on set 1002 and a legacy NULL-key market row.
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000000', 'sets-organizer@example.com');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, startgg_event_id)
values (
  'b7000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'TOP8 Sets Fixture',
  'IN_PROGRESS',
  70001
);

insert into public.tournament_sets (
  startgg_set_id, tournament_id, startgg_event_id, phase_id, phase_name,
  round, slot, startgg_state, state,
  entrant_a_startgg_id, entrant_a_name, entrant_b_startgg_id, entrant_b_name,
  winner_startgg_id, event_starts_at, started_at, completed_at
) values
  (1001, 'b7000000-0000-0000-0000-000000000001', 70001, 5001, 'Top 8', 1, 0, 3, 'COMPLETED',
   9001, 'Alpha', 9002, 'Bravo', 9001, now() - interval '2 hours', now() - interval '2 hours', now() - interval '1 hour'),
  (1002, 'b7000000-0000-0000-0000-000000000001', 70001, 5001, 'Top 8', 1, 1, 2, 'IN_PROGRESS',
   9003, 'Charlie', 9004, 'Delta', null, now() - interval '1 hour', now() - interval '1 hour', null),
  (1003, 'b7000000-0000-0000-0000-000000000001', 70001, 5001, 'Top 8', 2, 0, 0, 'PENDING',
   9001, 'Alpha', null, null, null, now(), null, null);

insert into public.onchain_markets (
  condition_id, question_id, startgg_event_id, market_type, creator_address,
  state, startgg_set_id, block_number, log_index
) values
  ('cond-1002', 'q-1002', 70001, 0, '0x0000000000000000000000000000000000000001', 'ACTIVE', 1002, 10, 0),
  ('cond-legacy', 'q-legacy', 70001, 1, '0x0000000000000000000000000000000000000001', 'ACTIVE', null, 11, 0);

-- ---------------------------------------------------------------------
-- Invariant 1: anon/authenticated cannot write tournament_sets
-- ---------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ insert into public.tournament_sets (startgg_set_id, tournament_id, startgg_event_id, phase_id, phase_name, round, slot, startgg_state, state)
     values (9999, 'b7000000-0000-0000-0000-000000000001', 70001, 5001, 'Top 8', 1, 0, 0, 'PENDING') $$,
  '42501',
  null,
  'anon is denied writing tournament_sets (service-role-only ingestion)'
);

select throws_ok(
  $$ select * from public.tournament_sets $$,
  '42501',
  null,
  'anon is denied reading tournament_sets base table (only the view is public)'
);

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'a7000000-0000-0000-0000-000000000000';

select throws_ok(
  $$ insert into public.tournament_sets (startgg_set_id, tournament_id, startgg_event_id, phase_id, phase_name, round, slot, startgg_state, state)
     values (9998, 'b7000000-0000-0000-0000-000000000001', 70001, 5001, 'Top 8', 1, 0, 0, 'PENDING') $$,
  '42501',
  null,
  'authenticated is denied writing tournament_sets (no client grants, no RLS policies)'
);

reset role;

-- ---------------------------------------------------------------------
-- Invariant 2: the view hides raw ids, exposes winner_name and the
-- existing-market link target
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'public_tournament_sets_view' and column_name = 'phase_id'),
  0,
  'view hides phase_id'
);

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'public_tournament_sets_view' and column_name = 'entrant_a_startgg_id'),
  0,
  'view hides entrant_a_startgg_id'
);

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'public_tournament_sets_view' and column_name = 'entrant_b_startgg_id'),
  0,
  'view hides entrant_b_startgg_id'
);

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'public_tournament_sets_view' and column_name = 'winner_startgg_id'),
  0,
  'view hides winner_startgg_id'
);

set local role anon;

select is(
  (select count(*)::int from public.public_tournament_sets_view),
  3,
  'anon can read the public view and sees all three fixture sets'
);

select is(
  (select winner_name from public.public_tournament_sets_view where startgg_set_id = 1001),
  'Alpha',
  'winner_name resolves to the public entrant name of the winner (winner id stays hidden)'
);

select is(
  (select has_market from public.public_tournament_sets_view where startgg_set_id = 1002),
  true,
  'has_market is true when a live (ACTIVE) market exists on the set'
);

select is(
  (select market_question_id from public.public_tournament_sets_view where startgg_set_id = 1002),
  'q-1002',
  'market_question_id exposes the live market''s question id as the detail-page link target'
);

select is(
  (select has_market from public.public_tournament_sets_view where startgg_set_id = 1001),
  false,
  'has_market is false when the set has no live market'
);

reset role;

-- ---------------------------------------------------------------------
-- Invariant 3: partial unique index on live markets per set
-- ---------------------------------------------------------------------

select throws_ok(
  $$ insert into public.onchain_markets (condition_id, question_id, startgg_event_id, market_type, creator_address, state, startgg_set_id, block_number, log_index)
     values ('cond-1002-bis', 'q-1002-bis', 70001, 0, '0x0000000000000000000000000000000000000001', 'PENDING', 1002, 12, 0) $$,
  '23505',
  null,
  'a second live market on the same set is rejected by onchain_markets_live_set_uniq'
);

select lives_ok(
  $$ insert into public.onchain_markets (condition_id, question_id, startgg_event_id, market_type, creator_address, state, startgg_set_id, block_number, log_index)
     values ('cond-1002-void', 'q-1002-void', 70001, 0, '0x0000000000000000000000000000000000000001', 'VOID', 1002, 13, 0) $$,
  'a VOID market on the same set is allowed (partial index only covers live states)'
);

select lives_ok(
  $$ insert into public.onchain_markets (condition_id, question_id, startgg_event_id, market_type, creator_address, state, startgg_set_id, block_number, log_index)
     values ('cond-legacy-2', 'q-legacy-2', 70001, 1, '0x0000000000000000000000000000000000000001', 'ACTIVE', null, 14, 0) $$,
  'legacy rows with NULL startgg_set_id are unaffected (question ids cannot be safely reversed)'
);

select * from finish();
rollback;
