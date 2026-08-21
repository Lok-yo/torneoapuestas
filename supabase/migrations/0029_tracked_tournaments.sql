-- 0029_tracked_tournaments.sql
-- Curated visibility registry for tournaments discovered by the poller or
-- imported by link. The registry is the only source used by public list
-- projections; the base tournaments table remains the ingestion store.
--
-- Rollback: drop the RPCs, view, and table. The client can then be reverted
-- to its previous base-table read without touching tournament data.

create table public.tracked_tournaments (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  startgg_event_id bigint not null check (startgg_event_id > 0),
  submitted_by uuid not null references auth.users (id),
  list text not null default 'main' check (list in ('main', 'finalizados')),
  created_at timestamptz not null default now(),
  primary key (tournament_id),
  unique (startgg_event_id)
);

create index tracked_tournaments_list_idx on public.tracked_tournaments (list, created_at desc);

comment on table public.tracked_tournaments is
  'Global allowlist for tournament visibility. Client writes go through add_tournament_by_link; poller writes use service role.';

alter table public.tracked_tournaments enable row level security;
revoke all on public.tracked_tournaments from anon, authenticated;

create table public.startgg_deferred_work (
  startgg_event_id bigint primary key,
  source text not null check (source in ('mx', 'tracked', 'both')),
  created_at timestamptz not null default now()
);

comment on table public.startgg_deferred_work is
  'Deferred poller work set for startgg-poller when cycle budget is exhausted or 429 occurs. Service-role only.';

alter table public.startgg_deferred_work enable row level security;
revoke all on public.startgg_deferred_work from anon, authenticated;

create or replace function public.upsert_startgg_deferred_work(
  p_startgg_event_id bigint,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.startgg_deferred_work (startgg_event_id, source)
  values (p_startgg_event_id, p_source)
  on conflict (startgg_event_id) do nothing;
end;
$$;

-- Seed all already-published start.gg tournaments so this migration does not
-- change the visible list while moving its authority to the registry. The
-- DISTINCT ON guard makes replay safe even if old data contains duplicates.
insert into public.tracked_tournaments (tournament_id, startgg_event_id, submitted_by)
select distinct on (t.startgg_event_id)
  t.id,
  t.startgg_event_id,
  t.organizer_id
from public.tournaments t
where t.status <> 'DRAFT'
  and t.startgg_event_id is not null
order by t.startgg_event_id, t.updated_at desc, t.id
on conflict (startgg_event_id) do nothing;

create view public.tracked_tournaments_view
as
select
  t.id,
  t.name,
  t.game_id,
  t.format_id,
  t.status,
  t.version,
  t.roster_frozen_at,
  t.startgg_event_id,
  t.created_at,
  t.updated_at,
  tr.list
from public.tracked_tournaments tr
join public.tournaments t on t.id = tr.tournament_id
where t.status <> 'DRAFT';

grant select on public.tracked_tournaments_view to anon, authenticated;

create or replace function public.add_tournament_by_link(
  p_startgg_event_id bigint,
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_tournament_id uuid;
  v_existing_tournament_id uuid;
  v_expected_event_id bigint;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_startgg_event_id is null or p_startgg_event_id <= 0 or p_tournament_id is null then
    raise exception 'VALIDATION_ERROR: event and tournament are required' using errcode = '22023';
  end if;

  select t.startgg_event_id
    into v_expected_event_id
  from public.tournaments t
  where t.id = p_tournament_id;

  if not found then
    raise exception 'NOT_FOUND: tournament does not exist' using errcode = 'P0002';
  end if;

  if v_expected_event_id is null or v_expected_event_id <> p_startgg_event_id then
    raise exception 'VALIDATION_ERROR: event does not belong to tournament' using errcode = '22023';
  end if;

  insert into public.tracked_tournaments (tournament_id, startgg_event_id, submitted_by)
  values (p_tournament_id, p_startgg_event_id, v_user_id)
  on conflict (startgg_event_id) do nothing
  returning tournament_id into v_inserted_tournament_id;

  if v_inserted_tournament_id is not null then
    return jsonb_build_object('status', 'tracked', 'tournamentId', v_inserted_tournament_id);
  end if;

  select tr.tournament_id
    into v_existing_tournament_id
  from public.tracked_tournaments tr
  where tr.startgg_event_id = p_startgg_event_id;

  return jsonb_build_object('status', 'already_tracked', 'tournamentId', v_existing_tournament_id);
end;
$$;

grant execute on function public.add_tournament_by_link(bigint, uuid) to authenticated;

create or replace function public.move_tracked_tournament(
  p_tournament_id uuid,
  p_list text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;
  if not public.has_role('admin'::public.app_role) then
    raise exception 'FORBIDDEN: only an admin may move tracked tournaments' using errcode = '42501';
  end if;
  if p_list not in ('main', 'finalizados') then
    raise exception 'VALIDATION_ERROR: list must be main or finalizados' using errcode = '22023';
  end if;

  update public.tracked_tournaments
  set list = p_list
  where tournament_id = p_tournament_id;

  if not found then
    raise exception 'NOT_FOUND: tracked tournament does not exist' using errcode = 'P0002';
  end if;

  return jsonb_build_object('status', 'moved', 'tournamentId', p_tournament_id, 'list', p_list);
end;
$$;

grant execute on function public.move_tracked_tournament(uuid, text) to authenticated;

create or replace function public.delete_tracked_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;
  if not public.has_role('admin'::public.app_role) then
    raise exception 'FORBIDDEN: only an admin may delete tracked tournaments' using errcode = '42501';
  end if;

  delete from public.tracked_tournaments where tournament_id = p_tournament_id;
  if not found then
    raise exception 'NOT_FOUND: tracked tournament does not exist' using errcode = 'P0002';
  end if;

  return jsonb_build_object('status', 'deleted', 'tournamentId', p_tournament_id);
end;
$$;

grant execute on function public.delete_tracked_tournament(uuid) to authenticated;
