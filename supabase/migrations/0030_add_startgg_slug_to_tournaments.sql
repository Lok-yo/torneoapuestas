-- 0030_add_startgg_slug_to_tournaments.sql
-- Adds the start.gg event slug the poller already has at import time, so
-- the client can link out to the source tournament on start.gg without an
-- extra API call. start.gg's `event.slug` already returns the full path
-- ("tournament/{tournament-slug}/event/{event-slug}"), so the client link
-- is simply `https://start.gg/${startgg_slug}`.
--
-- NOTE: tracked_tournaments_view's select list here reflects the column
-- order actually live in the database (includes organizer_id), which
-- already drifted from the literal 0029_tracked_tournaments.sql migration
-- file — that drift predates this change and is out of scope here.
--
-- Rollback: drop the column and recreate tracked_tournaments_view without it.

alter table public.tournaments add column startgg_slug text;

-- tracked_tournaments_view lists its columns explicitly, so the new column
-- must be projected through it too. Appended at the end of the select
-- list — CREATE OR REPLACE VIEW cannot reorder or remove existing ones.
create or replace view public.tracked_tournaments_view
as
select
  t.id,
  t.organizer_id,
  t.name,
  t.game_id,
  t.format_id,
  t.status,
  t.version,
  t.roster_frozen_at,
  t.startgg_event_id,
  t.created_at,
  t.updated_at,
  tr.list,
  t.startgg_slug
from public.tracked_tournaments tr
join public.tournaments t on t.id = tr.tournament_id
where t.status <> 'DRAFT';

grant select on public.tracked_tournaments_view to anon, authenticated;
