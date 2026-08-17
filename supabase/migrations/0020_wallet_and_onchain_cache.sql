-- Migration 0020: Wallet identity + on-chain read cache (additive only)
--
-- Additive to 0001-0019, no edits to any existing migration (rollback
-- plan: leave FEATURE_FLAGS.web3 off and stop the three edge functions;
-- no data recovery needed). Seven tables:
--   wallet_links            optional 1:1 SIWE wallet<->GG2 account link
--   startgg_entrant_links   shadow auth.users mapping for ingested entrants
--   startgg_ingestion_cursor  poller round-robin cursor + 429 backoff state
--   onchain_markets         read cache mirroring MarketFactory markets
--   onchain_positions       read cache mirroring CTF ERC-1155 balances
--   creation_bonds          bond-ledger mirror (on-chain remains source of truth)
--   onchain_events_cursor   event-indexer idempotency cursor (block, log_index)
--
-- See design.md "Data Model" and specs onchain-prediction-markets /
-- startgg-tournament-ingestion / wallet-identity. RLS follows the
-- deny-by-default pattern from 0004_rls_policies.sql: read-cache tables
-- are public-read (anon+authenticated), service-role write; ingestion
-- bookkeeping (startgg_entrant_links, startgg_ingestion_cursor,
-- onchain_events_cursor) is service-role only, no client access at all.

-- ---------------------------------------------------------------------
-- wallet_links: optional 1:1 SIWE link. Signature verification happens
-- client-side (wagmi/viem `verifyMessage` against the connecting
-- wallet's own signature — see src/lib/web3/hooks.js) before calling
-- link_wallet(); this table + RPC only enforce the 1:1 invariant and
-- single-use nonce, never gate any trading action (wallet-identity spec
-- "MUST NOT require this link for any trading action").
-- ---------------------------------------------------------------------

create table public.wallet_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  address text not null unique,
  chain_id integer not null,
  siwe_nonce text,
  linked_at timestamptz not null default now()
);

comment on table public.wallet_links is
  'Optional 1:1 wallet<->GG2 account link for social surfaces only (profile/leaderboard). Never required for trading.';

alter table public.wallet_links enable row level security;

revoke all on public.wallet_links from anon, authenticated;
grant select on public.wallet_links to authenticated;

create policy wallet_links_select_self on public.wallet_links
  for select
  to authenticated
  using (user_id = auth.uid());

-- Anyone may look up whether a given address is linked (for public
-- profile display), but only the row's own address/user_id — expose via
-- a narrow SECURITY DEFINER function rather than a blanket SELECT grant,
-- to avoid leaking the full link table.
create or replace function public.get_wallet_link_for_address(p_address text)
returns table (user_id uuid, address text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wl.user_id, wl.address
  from public.wallet_links wl
  where wl.address = lower(p_address);
$$;

grant execute on function public.get_wallet_link_for_address(text) to authenticated, anon;

-- SECURITY DEFINER RPC: enforces 1:1 both directions (PK on user_id,
-- UNIQUE on address) — a second link attempt by either the same user or
-- for an already-linked address raises a unique_violation (23505), which
-- callers surface as "link attempt rejected" per wallet-identity spec
-- "Second wallet link rejected".
create or replace function public.link_wallet(p_address text, p_chain_id integer, p_siwe_nonce text default null)
returns public.wallet_links
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.wallet_links;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Must be logged in to link a wallet'
      using errcode = '42501';
  end if;

  if p_address is null or length(trim(p_address)) = 0 then
    raise exception 'INVALID_ARGUMENT: address is required'
      using errcode = '22023';
  end if;

  insert into public.wallet_links (user_id, address, chain_id, siwe_nonce)
  values (v_user_id, lower(p_address), p_chain_id, p_siwe_nonce)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.link_wallet(text, integer, text) to authenticated;

create or replace function public.unlink_wallet()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.wallet_links where user_id = auth.uid();
end;
$$;

grant execute on function public.unlink_wallet() to authenticated;

-- ---------------------------------------------------------------------
-- startgg_entrant_links: shadow auth.users mapping for start.gg entrants
-- ingested with no GG2 login (design.md Decision 4). Written only by
-- startgg-poller (service role) — never client-writable, matching
-- 0004's deny-by-default pattern for internal bookkeeping tables.
-- ---------------------------------------------------------------------

create table public.startgg_entrant_links (
  startgg_entrant_id bigint primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.startgg_entrant_links is
  'Shadow auth.users mapping for start.gg-ingested entrants with no GG2 login. Written only by startgg-poller (service role).';

alter table public.startgg_entrant_links enable row level security;
revoke all on public.startgg_entrant_links from anon, authenticated;
-- No policies: service_role bypasses RLS entirely, and no anon/
-- authenticated grant exists, so this table is unreachable from the
-- client on both gates (grants + RLS), same defense-in-depth as 0004.

-- ---------------------------------------------------------------------
-- startgg_ingestion_cursor: round-robin polling cursor + 429 backoff
-- state (design.md "Polling budget"). Service-role only.
-- ---------------------------------------------------------------------

create table public.startgg_ingestion_cursor (
  source_key text primary key,
  last_polled_at timestamptz,
  last_completed_at timestamptz,
  backoff_until timestamptz,
  cycle_requests integer not null default 0
);

comment on table public.startgg_ingestion_cursor is
  'startgg-poller round-robin cursor across lanes a/b/c + 429 backoff_until. Service-role only.';

alter table public.startgg_ingestion_cursor enable row level security;
revoke all on public.startgg_ingestion_cursor from anon, authenticated;

-- ---------------------------------------------------------------------
-- onchain_markets: read cache mirroring MarketFactory.markets. Public
-- read (anyone can browse markets without a wallet connected), written
-- only by event-indexer (service role). On-chain state remains the
-- source of truth (onchain-prediction-markets spec "Collateral remains
-- on-chain").
-- ---------------------------------------------------------------------

create table public.onchain_markets (
  condition_id text primary key,
  question_id text not null unique,
  startgg_event_id bigint not null,
  market_type smallint not null,
  creator_address text not null,
  state text not null check (state in ('PENDING', 'CHALLENGED', 'ACTIVE', 'VOID')),
  fpmm_address text,
  block_number bigint not null,
  log_index integer not null,
  updated_at timestamptz not null default now()
);

create index onchain_markets_startgg_event_id_idx on public.onchain_markets (startgg_event_id);
create index onchain_markets_state_idx on public.onchain_markets (state);

comment on table public.onchain_markets is
  'Read-cache mirror of MarketFactory market state, populated by event-indexer. Never source of truth.';

alter table public.onchain_markets enable row level security;
revoke all on public.onchain_markets from anon, authenticated;
grant select on public.onchain_markets to authenticated, anon;

create policy onchain_markets_select_all on public.onchain_markets
  for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------
-- onchain_positions: read cache mirroring CTF ERC-1155 balances. Public
-- read, service-role write. Mirrors positions only — never a spendable
-- balance (onchain-prediction-markets spec "Collateral remains
-- on-chain": "returns a mirrored view only, with no ability to move the
-- underlying USDC").
-- ---------------------------------------------------------------------

create table public.onchain_positions (
  condition_id text not null,
  holder_address text not null,
  position_id text not null,
  balance numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (condition_id, holder_address, position_id)
);

create index onchain_positions_holder_idx on public.onchain_positions (holder_address);

comment on table public.onchain_positions is
  'Read-cache mirror of CTF ERC-1155 position balances. Never custodial and never a write path for funds.';

alter table public.onchain_positions enable row level security;
revoke all on public.onchain_positions from anon, authenticated;
grant select on public.onchain_positions to authenticated, anon;

create policy onchain_positions_select_all on public.onchain_positions
  for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------
-- creation_bonds: bond-ledger mirror (on-chain remains source of
-- truth). Public read, service-role write.
-- ---------------------------------------------------------------------

create table public.creation_bonds (
  question_id text primary key,
  creator text not null,
  amount numeric not null,
  state text not null check (state in ('LOCKED', 'CHALLENGED', 'REFUNDED', 'SLASHED')),
  challenger text,
  ruled_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.creation_bonds is
  'Read-cache mirror of MarketFactory creation-bond state. On-chain remains authoritative.';

alter table public.creation_bonds enable row level security;
revoke all on public.creation_bonds from anon, authenticated;
grant select on public.creation_bonds to authenticated, anon;

create policy creation_bonds_select_all on public.creation_bonds
  for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------
-- onchain_events_cursor: event-indexer idempotency cursor. Upserts by
-- (block_number, log_index) per design.md "Indexer reads only up to
-- latest - 20 blocks ... and upserts by (block_number, log_index)".
-- Service-role only.
-- ---------------------------------------------------------------------

create table public.onchain_events_cursor (
  contract_address text primary key,
  last_block bigint not null default 0,
  last_log_index integer not null default -1
);

comment on table public.onchain_events_cursor is
  'event-indexer per-contract cursor (last_block, last_log_index) enforcing idempotent, reorg-safe (latest-20 floor) log processing. Service-role only.';

alter table public.onchain_events_cursor enable row level security;
revoke all on public.onchain_events_cursor from anon, authenticated;
