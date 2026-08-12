-- 0009_registration_rpc.sql
-- register_participant / withdraw_participant: the sole authority for
-- roster membership. Both lock the owning tournament row (`for update`)
-- before reading/writing membership state, so two concurrent calls for
-- the same tournament serialize instead of racing — the mechanism
-- roster_concurrency.sql (3.6) proves produces exactly one membership.
-- Both are idempotent replays by request_id and never raise for an
-- expected business outcome (closed/full/duplicate/frozen/not_registered),
-- only for auth/validation before anything is recorded — same pattern as
-- 0006_username_claim.sql and 0008_lifecycle_rpc.sql. See tasks.md 3.5 and
-- tournament-operations spec "Registration and roster freeze".

create or replace function public.register_participant(p_request_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_outcome jsonb;
  v_tournament public.tournaments%rowtype;
  v_roster_size int;
  v_registered_count int;
  v_membership public.memberships%rowtype;
  v_membership_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_tournament_id is null then
    raise exception 'VALIDATION_ERROR: request_id and tournament_id are required' using errcode = '22023';
  end if;

  select outcome into v_existing_outcome
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'register_participant';

  if v_existing_outcome is not null then
    return v_existing_outcome;
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;

  if not found then
    raise exception 'NOT_FOUND: tournament does not exist' using errcode = 'P0002';
  end if;

  select roster_size into v_roster_size
  from public.tournament_formats
  where id = v_tournament.format_id;

  select * into v_membership
  from public.memberships
  where tournament_id = p_tournament_id and user_id = v_user_id;

  if v_tournament.status <> 'REGISTRATION_OPEN' or v_tournament.roster_frozen_at is not null then
    v_result := jsonb_build_object('status', 'closed');
  elsif found and v_membership.status = 'REGISTERED' then
    v_result := jsonb_build_object('status', 'already_registered', 'membershipId', v_membership.id);
  else
    select count(*) into v_registered_count
    from public.memberships
    where tournament_id = p_tournament_id and status = 'REGISTERED';

    if v_registered_count >= v_roster_size then
      v_result := jsonb_build_object('status', 'roster_full');
    else
      insert into public.memberships (tournament_id, user_id, status)
      values (p_tournament_id, v_user_id, 'REGISTERED')
      on conflict (tournament_id, user_id)
      do update set status = 'REGISTERED', updated_at = now()
      returning id into v_membership_id;

      v_result := jsonb_build_object('status', 'registered', 'membershipId', v_membership_id);
    end if;
  end if;

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'register_participant', p_tournament_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'register_participant',
    'tournament',
    p_tournament_id,
    case when (v_result ->> 'status') = 'registered' then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.register_participant(uuid, uuid) to authenticated;

create or replace function public.withdraw_participant(p_request_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_outcome jsonb;
  v_tournament public.tournaments%rowtype;
  v_membership public.memberships%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_tournament_id is null then
    raise exception 'VALIDATION_ERROR: request_id and tournament_id are required' using errcode = '22023';
  end if;

  select outcome into v_existing_outcome
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'withdraw_participant';

  if v_existing_outcome is not null then
    return v_existing_outcome;
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;

  if not found then
    raise exception 'NOT_FOUND: tournament does not exist' using errcode = 'P0002';
  end if;

  select * into v_membership
  from public.memberships
  where tournament_id = p_tournament_id and user_id = v_user_id;

  if v_tournament.roster_frozen_at is not null then
    v_result := jsonb_build_object('status', 'frozen');
  elsif not found or v_membership.status <> 'REGISTERED' then
    v_result := jsonb_build_object('status', 'not_registered');
  else
    update public.memberships
    set status = 'WITHDRAWN', updated_at = now()
    where id = v_membership.id;

    v_result := jsonb_build_object('status', 'withdrawn', 'membershipId', v_membership.id);
  end if;

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'withdraw_participant', p_tournament_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'withdraw_participant',
    'tournament',
    p_tournament_id,
    case when (v_result ->> 'status') = 'withdrawn' then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.withdraw_participant(uuid, uuid) to authenticated;
