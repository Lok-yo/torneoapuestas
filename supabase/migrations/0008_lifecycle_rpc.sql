-- 0008_lifecycle_rpc.sql
-- advance_tournament_state(request_id, tournament_id, action, expected_version):
-- the sole authority for tournament lifecycle transitions. Organizer- or
-- admin-only, optimistic-concurrency versioned, and audited. Mirrors the
-- same transition table as src/domain/tournaments/lifecycle.js (kept in
-- sync by hand; this function is the real authority, the JS module is the
-- client-testable mirror). See tasks.md 3.3 and tournament-operations spec
-- "Validated tournament lifecycle".
--
-- CLOSE_REGISTRATION also freezes the roster (sets roster_frozen_at),
-- consistent with 0009's registration/withdrawal rules reading that same
-- column. See tournament-operations spec "Registration and roster freeze".

create or replace function public.advance_tournament_state(
  p_request_id uuid,
  p_tournament_id uuid,
  p_action text,
  p_expected_version int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_tournament public.tournaments%rowtype;
  v_next_status text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_tournament_id is null or p_action is null then
    raise exception 'VALIDATION_ERROR: request_id, tournament_id and action are required' using errcode = '22023';
  end if;

  select outcome into v_existing
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'advance_tournament_state';

  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;

  if not found then
    raise exception 'NOT_FOUND: tournament does not exist' using errcode = 'P0002';
  end if;

  if v_tournament.organizer_id <> v_user_id and not public.has_role('admin') then
    raise exception 'FORBIDDEN: only the organizer or an admin may advance this tournament' using errcode = '42501';
  end if;

  -- From here on the function never raises for a business outcome: a
  -- version conflict or an invalid transition is recorded and returned as
  -- a stable structured result, never an exception, so the audit event
  -- below can never be rolled back by a later raise in this same call
  -- (see 0006_username_claim.sql's fix for that exact bug class).
  if v_tournament.version <> p_expected_version then
    v_result := jsonb_build_object('status', 'version_conflict', 'currentVersion', v_tournament.version);
  else
    v_next_status := case
      when v_tournament.status = 'DRAFT' and p_action = 'OPEN_REGISTRATION' then 'REGISTRATION_OPEN'
      when v_tournament.status = 'REGISTRATION_OPEN' and p_action = 'CLOSE_REGISTRATION' then 'REGISTRATION_CLOSED'
      when v_tournament.status = 'REGISTRATION_CLOSED' and p_action = 'START' then 'IN_PROGRESS'
      when v_tournament.status = 'IN_PROGRESS' and p_action = 'COMPLETE' then 'COMPLETED'
      when v_tournament.status in ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS')
        and p_action = 'CANCEL' then 'CANCELLED'
      else null
    end;

    if v_next_status is null then
      v_result := jsonb_build_object('status', 'invalid_transition', 'currentStatus', v_tournament.status);
    else
      update public.tournaments
      set
        status = v_next_status,
        version = version + 1,
        roster_frozen_at = case when p_action = 'CLOSE_REGISTRATION' then now() else roster_frozen_at end,
        updated_at = now()
      where id = p_tournament_id;

      v_result := jsonb_build_object(
        'status', 'transitioned',
        'newStatus', v_next_status,
        'version', v_tournament.version + 1
      );
    end if;
  end if;

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'advance_tournament_state', p_tournament_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'advance_tournament_state:' || p_action,
    'tournament',
    p_tournament_id,
    case when (v_result ->> 'status') = 'transitioned' then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.advance_tournament_state(uuid, uuid, text, int) to authenticated;
