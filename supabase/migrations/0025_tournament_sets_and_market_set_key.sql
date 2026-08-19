-- Migration 0025: TOP-8 set betting foundation
--
-- Persists start.gg TOP-8 bracket sets in a dedicated service-role table
-- (public.tournament_sets) plus an allowlisted public read view, and
-- re-keys the on-chain market cache by start.gg set so one web3 market
-- can exist per set instead of one per event. matches/results stay for
-- legacy GG2 tournaments; the startgg-poller stops writing them (that
-- change lives in the poller code, not here). See
-- openspec/changes/bracket-top8-betting/ design "Schema and Migration".
--
-- Rollback: drop this migration's objects (table, view, column, indexes);
-- onchain_markets rows with a set key keep the key, legacy NULL rows are
-- untouched (question ids cannot be safely reversed, so existing cache
-- rows stay unmapped by design).

-- ---------------------------------------------------------------------
-- tournament_sets: service-role write, no client grants, RLS on
-- ---------------------------------------------------------------------

create table public.tournament_sets (
  startgg_set_id bigint primary key check (startgg_set_id > 0),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  startgg_event_id bigint not null check (startgg_event_id > 0),
  phase_id bigint not null,
  phase_name text not null,
  round integer not null check (round > 0),
  slot integer not null check (slot >= 0),
  startgg_state smallint not null,
  state text not null check (state in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  entrant_a_startgg_id bigint,
  entrant_a_name text,
  entrant_b_startgg_id bigint,
  entrant_b_name text,
  winner_startgg_id bigint,
  event_starts_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tournament_id, startgg_set_id)
);

create index tournament_sets_tournament_round_idx on public.tournament_sets (tournament_id, round, slot);
create index tournament_sets_event_idx on public.tournament_sets (startgg_event_id);

comment on table public.tournament_sets is
  'start.gg TOP-8 bracket sets ingested by startgg-poller (service role). Never client-writable.';

alter table public.tournament_sets enable row level security;
revoke all on public.tournament_sets from anon, authenticated;
-- No policies: service_role bypasses RLS entirely and no anon/authenticated
-- grant exists, so the table is unreachable from the client on both gates
-- (grants + RLS), same defense-in-depth as 0004/0020 bookkeeping tables.

-- ---------------------------------------------------------------------
-- onchain_markets: optional per-set key for the web3 market cache
-- ---------------------------------------------------------------------

alter table public.onchain_markets add column startgg_set_id bigint check (startgg_set_id > 0);

create index onchain_markets_set_idx on public.onchain_markets (startgg_set_id);

-- Partial unique index: at most one live (PENDING/CHALLENGED/ACTIVE)
-- market per set. VOID and legacy NULL-key rows are excluded so the
-- cache never blocks re-creation after a void nor legacy rows at all.
create unique index onchain_markets_live_set_uniq on public.onchain_markets (startgg_set_id)
  where startgg_set_id is not null and state in ('PENDING', 'CHALLENGED', 'ACTIVE');

-- ---------------------------------------------------------------------
-- public_tournament_sets_view: allowlisted public projection of the
-- TOP-8 bracket. Deliberately hides phase_id, raw entrant/winner ids,
-- and cache internals; exposes winner_name (already-public bracket
-- knowledge, enables the winner highlight) and market_question_id (link
-- target when a live market exists on the set). Same definer-privilege
-- pattern as 0005_public_views.sql — the boundary is the column
-- allowlist, not caller privilege.
-- ---------------------------------------------------------------------

create view public.public_tournament_sets_view
as
select
  s.startgg_set_id,
  s.tournament_id,
  s.startgg_event_id,
  s.phase_name,
  s.round,
  s.slot,
  s.state,
  s.entrant_a_name,
  s.entrant_b_name,
  s.event_starts_at,
  s.started_at,
  s.completed_at,
  s.updated_at,
  case
    when s.winner_startgg_id = s.entrant_a_startgg_id then s.entrant_a_name
    when s.winner_startgg_id = s.entrant_b_startgg_id then s.entrant_b_name
    else null
  end as winner_name,
  exists (
    select 1 from public.onchain_markets m
    where m.startgg_set_id = s.startgg_set_id
      and m.state in ('PENDING', 'CHALLENGED', 'ACTIVE')
  ) as has_market,
  (
    select m.question_id from public.onchain_markets m
    where m.startgg_set_id = s.startgg_set_id
      and m.state in ('PENDING', 'CHALLENGED', 'ACTIVE')
    order by m.updated_at desc
    limit 1
  ) as market_question_id
from public.tournament_sets s;

grant select on public.public_tournament_sets_view to anon, authenticated;
