-- wallet_and_onchain_cache.sql
-- GREEN against 0020_wallet_and_onchain_cache.sql. Proves three
-- invariants required by the p2p-crypto-prediction-markets change without
-- editing any existing migration:
--   1. A direct write into results/matches (the startgg-poller's write
--      pattern — service role, no submit_official_result RPC call) still
--      fires 0012's rating-projection trigger completely unchanged.
--   2. 0018's auto-resolve-markets trigger stays a true no-op for an
--      ingested tournament, because ingestion never writes public.markets.
--   3. wallet_links enforces 1:1 in both directions — a second link
--      attempt (by the same user, or for an already-linked address) is
--      rejected.
-- See tasks.md 7.2/7.3/7.4 and design.md Decisions 4-5.

begin;

select plan(9);

-- ---------------------------------------------------------------------
-- Fixture: one tournament with one match, mirroring the ingestion
-- worker's shadow-identity write pattern (Decision 4) — entrants exist
-- as auth.users rows with no real login, linked via
-- startgg_entrant_links.
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-000000000000', 'ingestion-organizer@example.com'),
  ('a6000000-0000-0000-0000-000000000001', 'ingested-entrant-a@example.com'),
  ('a6000000-0000-0000-0000-000000000002', 'ingested-entrant-b@example.com');

insert into public.profiles (user_id) values
  ('a6000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000002');

insert into public.startgg_entrant_links (startgg_entrant_id, user_id) values
  (9001, 'a6000000-0000-0000-0000-000000000001'),
  (9002, 'a6000000-0000-0000-0000-000000000002');

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, roster_frozen_at)
values (
  'b6000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000000',
  'ssbu',
  '00000000-0000-0000-0000-000000000001',
  'Ingested MX Tournament Fixture',
  'IN_PROGRESS',
  now()
);

insert into public.memberships (id, tournament_id, user_id, status) values
  ('c6000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'REGISTERED'),
  ('c6000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'REGISTERED');

insert into public.brackets (id, tournament_id, format_id)
values ('d6000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

insert into public.matches (id, bracket_id, tournament_id, round, slot, participant_a_membership_id, participant_b_membership_id, status, next_match_id)
values ('e6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 1, 0, 'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'READY', null);

-- ---------------------------------------------------------------------
-- Invariant 1: a direct service-role write into results (the poller's
-- write pattern, NOT the submit_official_result RPC) fires 0012's
-- rating-projection trigger exactly as it would for any other write.
-- ---------------------------------------------------------------------

insert into public.results (id, match_id, games_won_a, games_won_b, winner_membership_id, submitted_by, ruleset_version, status, request_id)
values (
  'f6000000-0000-0000-0000-000000000001',
  'e6000000-0000-0000-0000-000000000001',
  2, 0,
  'c6000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000000',
  1,
  'OFFICIAL',
  'f6000000-0000-0000-0000-000000000099'
);

select is(
  (select count(*)::int from public.rating_events where result_id = 'f6000000-0000-0000-0000-000000000001'),
  2,
  'a direct (non-RPC) write into results still fires 0012''s trigger: exactly two rating events projected'
);

select is(
  (select rs.rating from public.rating_snapshots rs where rs.user_id = 'a6000000-0000-0000-0000-000000000001' and rs.game_id = 'ssbu'),
  1025::numeric,
  'winner''s snapshot recomputed via the unmodified 0012 trigger (base 1000 + WIN_DELTA 25)'
);

select is(
  (select rs.rating from public.rating_snapshots rs where rs.user_id = 'a6000000-0000-0000-0000-000000000002' and rs.game_id = 'ssbu'),
  975::numeric,
  'loser''s snapshot recomputed via the unmodified 0012 trigger (base 1000 - LOSE_DELTA 25)'
);

-- ---------------------------------------------------------------------
-- Invariant 2: 0018's auto-resolve-markets trigger stays a true no-op
-- for an ingested tournament — ingestion never writes public.markets
-- (design.md Decision 5), so the trigger's FOR loop finds zero rows and
-- does nothing, without erroring.
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.markets where tournament_id = 'b6000000-0000-0000-0000-000000000001'),
  0,
  'precondition: no public.markets row exists for the ingested tournament'
);

update public.tournaments set status = 'COMPLETED' where id = 'b6000000-0000-0000-0000-000000000001';

select is(
  (select status from public.tournaments where id = 'b6000000-0000-0000-0000-000000000001'),
  'COMPLETED',
  '0018''s trigger does not block or error the status transition even with zero markets to resolve'
);

select is(
  (select count(*)::int from public.markets where tournament_id = 'b6000000-0000-0000-0000-000000000001'),
  0,
  '0018''s auto-resolve trigger created no public.markets rows — stays a true no-op for ingested tournaments'
);

-- ---------------------------------------------------------------------
-- Invariant 3: wallet_links enforces 1:1 in both directions.
-- ---------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select public.link_wallet('0xAAAA000000000000000000000000000000AAAA', 80002, 'nonce-1') $$,
  'first wallet link for this user succeeds'
);

select throws_ok(
  $$ select public.link_wallet('0xBBBB000000000000000000000000000000BBBB', 80002, 'nonce-2') $$,
  '23505',
  null,
  'a second wallet link attempt by the same already-linked user is rejected (unique_violation on user_id PK)'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$ select public.link_wallet('0xaaaa000000000000000000000000000000aaaa', 80002, 'nonce-3') $$,
  '23505',
  null,
  'linking an address already linked to a different user is rejected (unique_violation on address)'
);

reset role;

select * from finish();
rollback;
