-- 0005_public_views.sql
-- Allowlisted public read models. Each view exposes only intentionally
-- published, non-private fields; private identity, membership, audit,
-- and command-outcome data never appear here.
--
-- These views deliberately run with the VIEW OWNER's privileges (the
-- Postgres default — no `security_invoker`), the same "bypass RLS, but
-- only the deliberately curated columns/rows ever leave the function/
-- view" pattern 0004_rls_policies.sql already uses for every write RPC.
-- The alternative (`security_invoker = true`) was tried first and
-- rejected: brackets/matches/results/rating_events/rating_snapshots/
-- memberships/profiles are all RLS-locked to organizer/participant/
-- admin, so a `security_invoker` view joining them would make `anon`'s
-- query fail with a permission error instead of returning the published
-- projection — silently defeating the very requirement these views
-- exist to satisfy (tournament-operations spec "Public projection and
-- closed perimeter"). The security boundary here is each view's own
-- column allowlist and `where` filter (e.g. `status <> 'DRAFT'`), not
-- caller privilege — exactly like a SECURITY DEFINER RPC. See
-- platform-foundation spec "Least-privilege data access".

create view public.public_tournaments_view
as
select
  t.id,
  t.name,
  t.game_id,
  t.format_id,
  t.status,
  t.roster_frozen_at,
  t.created_at,
  t.updated_at
from public.tournaments t
where t.status <> 'DRAFT';

grant select on public.public_tournaments_view to anon, authenticated;

create view public.public_brackets_view
as
select
  m.id as match_id,
  m.bracket_id,
  m.tournament_id,
  m.round,
  m.slot,
  m.next_match_id,
  m.next_match_slot,
  m.status,
  pa.username as participant_a_username,
  pb.username as participant_b_username,
  r.games_won_a,
  r.games_won_b,
  r.status as result_status
from public.matches m
join public.tournaments t on t.id = m.tournament_id
left join public.memberships ma on ma.id = m.participant_a_membership_id
left join public.memberships mb on mb.id = m.participant_b_membership_id
left join public.profiles pa on pa.user_id = ma.user_id
left join public.profiles pb on pb.user_id = mb.user_id
left join public.results r on r.match_id = m.id and r.status = 'OFFICIAL'
where t.status <> 'DRAFT';

grant select on public.public_brackets_view to anon, authenticated;

create view public.public_leaderboard_view
as
select
  rs.game_id,
  p.username,
  rs.rating,
  rs.version,
  rs.computed_at
from public.rating_snapshots rs
join public.profiles p on p.user_id = rs.user_id
where p.username is not null
order by rs.game_id, rs.rating desc;

grant select on public.public_leaderboard_view to anon, authenticated;

create view public.public_player_history_view
as
select
  p.username,
  re.game_id,
  re.delta,
  re.version,
  re.review_state,
  re.effective_at
from public.rating_events re
join public.memberships m on m.id = re.participant_membership_id
join public.profiles p on p.user_id = m.user_id
where p.username is not null
order by re.effective_at desc;

grant select on public.public_player_history_view to anon, authenticated;
