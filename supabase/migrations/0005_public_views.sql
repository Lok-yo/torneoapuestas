-- 0005_public_views.sql
-- Allowlisted public read models. Each view exposes only intentionally
-- published, non-private fields; private identity, membership, audit,
-- and command-outcome data never appear here. Views run with the
-- querying role's own privileges (security_invoker), and each
-- underlying table's RLS still applies — a view cannot widen access.
-- See platform-foundation spec "Least-privilege data access" and
-- tournament-operations spec "Public projection and closed perimeter".

create view public.public_tournaments_view
with (security_invoker = true)
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
with (security_invoker = true)
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
with (security_invoker = true)
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
with (security_invoker = true)
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
