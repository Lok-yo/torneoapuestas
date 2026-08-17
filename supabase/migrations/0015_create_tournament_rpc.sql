-- 0015_create_tournament_rpc.sql
-- create_tournament(p_request_id, p_name, p_game_id, p_format_id):
-- Creates a DRAFT-status tournament for the approved game/format catalog item.
-- Organizer- or admin-authorized, request_id-idempotent, command_outcomes-audited,
-- and recorded in audit_events.
-- Also provides claim_organizer_role() so an authenticated user can claim the
-- organizer role grant in user_roles.

create or replace function public.create_tournament(
  p_request_id uuid,
  p_name text,
  p_game_id text default 'ssbu',
  p_format_id uuid default '00000000-0000-0000-0000-000000000001'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_tournament_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_name is null or length(trim(p_name)) = 0 then
    raise exception 'VALIDATION_ERROR: request_id and non-empty name are required' using errcode = '22023';
  end if;

  select outcome into v_existing
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'create_tournament';

  if v_existing is not null then
    return v_existing;
  end if;

  if not (public.has_role('organizer') or public.has_role('admin')) then
    raise exception 'FORBIDDEN: only organizers or admins may create tournaments' using errcode = '42501';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'NOT_FOUND: game does not exist' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.tournament_formats where id = p_format_id and game_id = p_game_id) then
    raise exception 'NOT_FOUND: format does not exist' using errcode = 'P0002';
  end if;

  v_tournament_id := gen_random_uuid();

  insert into public.tournaments (id, organizer_id, game_id, format_id, name, status)
  values (v_tournament_id, v_user_id, p_game_id, p_format_id, trim(p_name), 'DRAFT');

  v_result := jsonb_build_object(
    'status', 'created',
    'tournamentId', v_tournament_id,
    'name', trim(p_name),
    'organizerId', v_user_id,
    'gameId', p_game_id,
    'formatId', p_format_id,
    'tournamentStatus', 'DRAFT'
  );

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'create_tournament', v_tournament_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'create_tournament',
    'tournament',
    v_tournament_id,
    'SUCCESS',
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.create_tournament(uuid, text, text, uuid) to authenticated;

create or replace function public.claim_organizer_role()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  insert into public.user_roles (user_id, role, granted_by, granted_at)
  values (v_user_id, 'organizer', v_user_id, now())
  on conflict (user_id, role) do nothing;

  return jsonb_build_object('status', 'granted', 'role', 'organizer');
end;
$$;

grant execute on function public.claim_organizer_role() to authenticated;
