-- 0010_bracket_rpc.sql
-- generate_bracket(request_id, tournament_id): the sole authority for
-- bracket creation. Organizer/admin-only, one transaction, deterministic
-- standard single-elimination seeding (1v8, 4v5, 3v6, 2v7) mirroring
-- src/domain/tournaments/bracket.js. Locks the tournament row before
-- checking for an existing bracket, so concurrent/repeated calls for the
-- same tournament serialize and only the first ever inserts — every
-- later call (whether a request_id replay or a genuinely concurrent
-- second caller) returns the same already-generated bracket instead of a
-- partial or duplicate graph. See tasks.md 3.8 and tournament-operations
-- spec "Bracket and match invariants".

create or replace function public.generate_bracket(p_request_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_outcome jsonb;
  v_tournament public.tournaments%rowtype;
  v_existing_bracket_id uuid;
  v_roster_size int;
  v_registered_count int;
  v_seeds uuid[];
  v_bracket_id uuid;
  v_r2_slot0 uuid := gen_random_uuid();
  v_r2_slot1 uuid := gen_random_uuid();
  v_r3_slot0 uuid := gen_random_uuid();
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
  where request_id = p_request_id and command_name = 'generate_bracket';

  if v_existing_outcome is not null then
    return v_existing_outcome;
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;

  if not found then
    raise exception 'NOT_FOUND: tournament does not exist' using errcode = 'P0002';
  end if;

  if v_tournament.organizer_id <> v_user_id and not public.has_role('admin') then
    raise exception 'FORBIDDEN: only the organizer or an admin may generate this bracket' using errcode = '42501';
  end if;

  select id into v_existing_bracket_id from public.brackets where tournament_id = p_tournament_id;

  if v_existing_bracket_id is not null then
    v_result := jsonb_build_object('status', 'already_exists', 'bracketId', v_existing_bracket_id);
  elsif v_tournament.status <> 'REGISTRATION_CLOSED' then
    v_result := jsonb_build_object('status', 'invalid_state', 'currentStatus', v_tournament.status);
  else
    select roster_size into v_roster_size
    from public.tournament_formats
    where id = v_tournament.format_id;

    select array_agg(id order by created_at, id) into v_seeds
    from public.memberships
    where tournament_id = p_tournament_id and status = 'REGISTERED';

    select coalesce(array_length(v_seeds, 1), 0) into v_registered_count;

    if v_registered_count <> v_roster_size then
      v_result := jsonb_build_object('status', 'incomplete_roster', 'registeredCount', v_registered_count);
    else
      insert into public.brackets (id, tournament_id, format_id)
      values (gen_random_uuid(), p_tournament_id, v_tournament.format_id)
      returning id into v_bracket_id;

      -- Insert leaf-to-root (final first, then round 2, then round 1) so
      -- every next_match_id foreign key already points at a row that
      -- exists by the time it is referenced — matches.next_match_id
      -- references matches.id, and this table has no rows yet.
      --
      -- The final never fabricates a winner: both participant slots start
      -- null until an earlier match's official result fills them in (see
      -- 0011_result_rpc.sql).
      insert into public.matches (
        id, bracket_id, tournament_id, round, slot,
        participant_a_membership_id, participant_b_membership_id,
        next_match_id, next_match_slot, status
      )
      values
        (v_r3_slot0, v_bracket_id, p_tournament_id, 3, 0, null, null, null, null, 'PENDING');

      insert into public.matches (
        id, bracket_id, tournament_id, round, slot,
        participant_a_membership_id, participant_b_membership_id,
        next_match_id, next_match_slot, status
      )
      values
        (v_r2_slot0, v_bracket_id, p_tournament_id, 2, 0, null, null, v_r3_slot0, 'A', 'PENDING'),
        (v_r2_slot1, v_bracket_id, p_tournament_id, 2, 1, null, null, v_r3_slot0, 'B', 'PENDING');

      -- Round 1: standard seeding pairs, each feeding into round 2 (A on
      -- even slots, B on odd slots) — mirrors bracket.js's ROUND_1_PAIRS.
      insert into public.matches (
        id, bracket_id, tournament_id, round, slot,
        participant_a_membership_id, participant_b_membership_id,
        next_match_id, next_match_slot, status
      )
      values
        (gen_random_uuid(), v_bracket_id, p_tournament_id, 1, 0, v_seeds[1], v_seeds[8], v_r2_slot0, 'A', 'READY'),
        (gen_random_uuid(), v_bracket_id, p_tournament_id, 1, 1, v_seeds[4], v_seeds[5], v_r2_slot0, 'B', 'READY'),
        (gen_random_uuid(), v_bracket_id, p_tournament_id, 1, 2, v_seeds[3], v_seeds[6], v_r2_slot1, 'A', 'READY'),
        (gen_random_uuid(), v_bracket_id, p_tournament_id, 1, 3, v_seeds[2], v_seeds[7], v_r2_slot1, 'B', 'READY');

      v_result := jsonb_build_object('status', 'created', 'bracketId', v_bracket_id);
    end if;
  end if;

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'generate_bracket', p_tournament_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'generate_bracket',
    'tournament',
    p_tournament_id,
    case when (v_result ->> 'status') in ('created', 'already_exists') then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.generate_bracket(uuid, uuid) to authenticated;
