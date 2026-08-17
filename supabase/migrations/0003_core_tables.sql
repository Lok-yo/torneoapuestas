-- 0003_core_tables.sql
-- Core Stage 1 schema: profiles, one game/format catalog, tournaments,
-- registrations, brackets, matches, official results, rating
-- events/snapshots, an append-only audit trail, and the non-financial
-- command-outcomes idempotency ledger. See design.md "Interfaces /
-- Contracts" and "Mutable state vs events".

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text,
  username_normalized text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One profile per authenticated identity. username_normalized gets its unique index in 0006_username_claim.sql.';

-- ---------------------------------------------------------------------
-- Game / format catalog (Stage 1 ships exactly one approved configuration)
-- ---------------------------------------------------------------------

create table public.games (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.tournament_formats (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games (id),
  name text not null,
  participant_mode text not null default '1v1' check (participant_mode = '1v1'),
  bracket_type text not null default 'single_elimination' check (bracket_type = 'single_elimination'),
  roster_size int not null check (roster_size > 0),
  best_of int not null check (best_of > 0 and best_of % 2 = 1),
  ruleset jsonb not null,
  ruleset_version int not null default 1,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tournament lifecycle and roster
-- ---------------------------------------------------------------------

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id),
  game_id text not null references public.games (id),
  format_id uuid not null references public.tournament_formats (id),
  name text not null,
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  version int not null default 1,
  roster_frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tournaments_organizer_id_idx on public.tournaments (organizer_id);
create index tournaments_status_idx on public.tournaments (status);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'WITHDRAWN')),
  seed int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index memberships_tournament_id_idx on public.memberships (tournament_id);
create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------
-- Bracket and matches
-- ---------------------------------------------------------------------

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments (id) on delete cascade,
  format_id uuid not null references public.tournament_formats (id),
  graph_version int not null default 1,
  generated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null check (round > 0),
  slot int not null check (slot >= 0),
  participant_a_membership_id uuid references public.memberships (id),
  participant_b_membership_id uuid references public.memberships (id),
  next_match_id uuid references public.matches (id),
  next_match_slot text check (next_match_slot in ('A', 'B')),
  status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'COMPLETED')),
  created_at timestamptz not null default now(),
  unique (bracket_id, round, slot)
);

create index matches_tournament_id_idx on public.matches (tournament_id);
create index matches_bracket_id_idx on public.matches (bracket_id);

-- ---------------------------------------------------------------------
-- Official results
-- ---------------------------------------------------------------------

create table public.results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  games_won_a int not null check (games_won_a >= 0),
  games_won_b int not null check (games_won_b >= 0),
  winner_membership_id uuid not null references public.memberships (id),
  submitted_by uuid not null references auth.users (id),
  ruleset_version int not null,
  version int not null default 1,
  status text not null default 'OFFICIAL' check (status in ('OFFICIAL', 'CORRECTED')),
  request_id uuid not null,
  created_at timestamptz not null default now()
);

create index results_match_id_idx on public.results (match_id);

-- ---------------------------------------------------------------------
-- Rating projections (derived strictly from official results)
-- ---------------------------------------------------------------------

create table public.rating_events (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.results (id),
  participant_membership_id uuid not null references public.memberships (id),
  game_id text not null references public.games (id),
  ruleset_version int not null,
  delta numeric not null,
  version int not null default 1,
  review_state text not null default 'CLEAN' check (review_state in ('CLEAN', 'NEEDS_REVIEW')),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index rating_events_result_id_idx on public.rating_events (result_id);
create index rating_events_membership_id_idx on public.rating_events (participant_membership_id);

create table public.rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  game_id text not null references public.games (id),
  rating numeric not null,
  version int not null default 1,
  computed_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- ---------------------------------------------------------------------
-- Audit (append-only; update/delete are revoked in 0004_rls_policies.sql)
-- ---------------------------------------------------------------------

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null check (outcome in ('SUCCESS', 'FAILURE', 'DENIED')),
  request_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index audit_events_actor_idx on public.audit_events (actor_id);

-- ---------------------------------------------------------------------
-- Non-financial command-outcomes idempotency ledger
-- ---------------------------------------------------------------------

create table public.command_outcomes (
  request_id uuid primary key,
  command_name text not null,
  aggregate_id uuid,
  actor_id uuid references auth.users (id),
  outcome jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.command_outcomes is
  'Non-financial idempotency ledger only: replays the original outcome for a retried request_id. Never holds balances, positions, or settlement state.';
