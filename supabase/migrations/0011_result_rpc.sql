-- 0011_result_rpc.sql
-- submit_official_result(request_id, match_id, games_won_a, games_won_b):
-- the sole authority for official match results. Organizer (of the owning
-- tournament) or referee/admin only. Validates the score against the
-- tournament format's best_of schema (mirrors
-- src/domain/tournaments/result.js), atomically records the result,
-- advances the winner into the next bracket match, and audits — all in
-- one transaction, idempotent by request_id. See tasks.md 3.11 and
-- tournament-operations spec "Official result authority".

create or replace function public.submit_official_result(
  p_request_id uuid,
  p_match_id uuid,
  p_games_won_a int,
  p_games_won_b int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_outcome jsonb;
  v_match public.matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_best_of int;
  v_ruleset_version int;
  v_wins_needed int;
  v_valid_score boolean;
  v_winner_side text;
  v_winner_membership_id uuid;
  v_result_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_match_id is null or p_games_won_a is null or p_games_won_b is null then
    raise exception 'VALIDATION_ERROR: request_id, match_id, games_won_a and games_won_b are required' using errcode = '22023';
  end if;

  select outcome into v_existing_outcome
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'submit_official_result';

  if v_existing_outcome is not null then
    return v_existing_outcome;
  end if;

  select * into v_match from public.matches where id = p_match_id for update;

  if not found then
    raise exception 'NOT_FOUND: match does not exist' using errcode = 'P0002';
  end if;

  select * into v_tournament from public.tournaments where id = v_match.tournament_id for update;

  if v_tournament.organizer_id <> v_user_id and not public.has_role('referee') and not public.has_role('admin') then
    raise exception 'FORBIDDEN: only the organizer, a referee, or an admin may submit an official result' using errcode = '42501';
  end if;

  select best_of, ruleset_version into v_best_of, v_ruleset_version
  from public.tournament_formats
  where id = v_tournament.format_id;

  v_wins_needed := (v_best_of / 2) + 1;

  v_valid_score :=
    p_games_won_a >= 0 and p_games_won_b >= 0
    and (p_games_won_a + p_games_won_b) <= v_best_of
    and (
      (p_games_won_a = v_wins_needed and p_games_won_b < v_wins_needed)
      or (p_games_won_b = v_wins_needed and p_games_won_a < v_wins_needed)
    );

  if v_match.status <> 'READY' then
    v_result := jsonb_build_object('status', 'not_completable', 'matchStatus', v_match.status);
  elsif not v_valid_score then
    v_result := jsonb_build_object('status', 'invalid_score', 'winsNeeded', v_wins_needed);
  else
    v_winner_side := case when p_games_won_a = v_wins_needed then 'A' else 'B' end;
    v_winner_membership_id := case
      when v_winner_side = 'A' then v_match.participant_a_membership_id
      else v_match.participant_b_membership_id
    end;

    insert into public.results (
      match_id, games_won_a, games_won_b, winner_membership_id,
      submitted_by, ruleset_version, request_id
    )
    values (
      p_match_id, p_games_won_a, p_games_won_b, v_winner_membership_id,
      v_user_id, v_ruleset_version, p_request_id
    )
    returning id into v_result_id;

    update public.matches set status = 'COMPLETED' where id = p_match_id;

    -- Advance the winner into the next bracket match, then flip that
    -- match to READY once both of its participant slots are filled — it
    -- never had a fabricated winner; this is the first time either slot
    -- is legitimately known.
    if v_match.next_match_id is not null then
      if v_match.next_match_slot = 'A' then
        update public.matches set participant_a_membership_id = v_winner_membership_id
        where id = v_match.next_match_id;
      else
        update public.matches set participant_b_membership_id = v_winner_membership_id
        where id = v_match.next_match_id;
      end if;

      update public.matches
      set status = 'READY'
      where id = v_match.next_match_id
        and participant_a_membership_id is not null
        and participant_b_membership_id is not null
        and status = 'PENDING';
    end if;

    v_result := jsonb_build_object(
      'status', 'accepted',
      'resultId', v_result_id,
      'winnerMembershipId', v_winner_membership_id
    );
  end if;

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'submit_official_result', p_match_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'submit_official_result',
    'match',
    p_match_id,
    case when (v_result ->> 'status') = 'accepted' then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.submit_official_result(uuid, uuid, int, int) to authenticated;
