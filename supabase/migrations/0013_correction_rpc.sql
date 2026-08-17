-- 0013_correction_rpc.sql
-- correct_result(request_id, result_id, expected_version, games_won_a,
-- games_won_b, reason): the sole authorized correction path for an
-- official result. Organizer (of the owning tournament)/referee/admin
-- only, and a non-empty reason is required. Appends a new, higher-version
-- results row (which the 0012 trigger projects into fresh rating_events
-- and a recomputed snapshot) rather than mutating the original row —
-- prior ratings/leaderboard states/evidence are never erased. A stale
-- expected_version (a conflicting source version) is rejected without
-- changing state and flags the prior events for review rather than
-- silently picking a winner. See tasks.md 4.5/4.6 and rating-projections
-- spec "Correction and historical auditability" / "Deterministic and
-- retry-safe processing".
--
-- Stage 1 scope note: this corrects the *result and rating projection*
-- only. It deliberately does not retroactively reflow bracket state that
-- already advanced from the original (now-superseded) winner — that is a
-- materially larger bracket-integrity feature out of this change's scope
-- (rating-projections spec, not tournament-operations). An operator who
-- needs the bracket itself corrected still has the full audit trail
-- (results.status = 'CORRECTED', correction_reason, corrected_by) to act
-- on manually.

alter table public.results
  add column correction_reason text,
  add column corrected_by uuid references auth.users (id);

create or replace function public.correct_result(
  p_request_id uuid,
  p_result_id uuid,
  p_expected_version int,
  p_games_won_a int,
  p_games_won_b int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_outcome jsonb;
  v_original public.results%rowtype;
  v_match public.matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_best_of int;
  v_ruleset_version int;
  v_wins_needed int;
  v_valid_score boolean;
  v_winner_membership_id uuid;
  v_new_result_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_result_id is null or p_expected_version is null
     or p_games_won_a is null or p_games_won_b is null then
    raise exception 'VALIDATION_ERROR: request_id, result_id, expected_version, games_won_a and games_won_b are required'
      using errcode = '22023';
  end if;

  select outcome into v_existing_outcome
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'correct_result';

  if v_existing_outcome is not null then
    return v_existing_outcome;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    v_result := jsonb_build_object('status', 'reason_required');
    insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
    values (p_request_id, 'correct_result', p_result_id, v_user_id, v_result)
    on conflict (request_id) do nothing;
    insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
    values (v_user_id, 'correct_result', 'result', p_result_id, 'DENIED', p_request_id, v_result);
    return v_result;
  end if;

  select * into v_original from public.results where id = p_result_id for update;

  if not found then
    raise exception 'NOT_FOUND: result does not exist' using errcode = 'P0002';
  end if;

  select * into v_match from public.matches where id = v_original.match_id;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id for update;

  if v_tournament.organizer_id <> v_user_id and not public.has_role('referee') and not public.has_role('admin') then
    raise exception 'FORBIDDEN: only the organizer, a referee, or an admin may correct an official result'
      using errcode = '42501';
  end if;

  if v_original.version <> p_expected_version then
    -- Conflicting source version: stop for review, preserve existing
    -- evidence, never silently pick a winner. See rating-projections spec
    -- "Conflicting history".
    update public.rating_events
    set review_state = 'NEEDS_REVIEW'
    where result_id = v_original.id;

    v_result := jsonb_build_object('status', 'version_conflict', 'currentVersion', v_original.version);

    insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
    values (p_request_id, 'correct_result', p_result_id, v_user_id, v_result)
    on conflict (request_id) do nothing;
    insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
    values (v_user_id, 'correct_result', 'result', p_result_id, 'DENIED', p_request_id, v_result);
    return v_result;
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

  if not v_valid_score then
    v_result := jsonb_build_object('status', 'invalid_score', 'winsNeeded', v_wins_needed);
    insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
    values (p_request_id, 'correct_result', p_result_id, v_user_id, v_result)
    on conflict (request_id) do nothing;
    insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
    values (v_user_id, 'correct_result', 'result', p_result_id, 'DENIED', p_request_id, v_result);
    return v_result;
  end if;

  v_winner_membership_id := case
    when p_games_won_a = v_wins_needed then v_match.participant_a_membership_id
    else v_match.participant_b_membership_id
  end;

  -- Supersede, never delete: the original row's evidence stays exactly as
  -- submitted; only its status flips so it stops feeding live snapshots.
  update public.results set status = 'CORRECTED' where id = v_original.id;

  insert into public.results (
    match_id, games_won_a, games_won_b, winner_membership_id, submitted_by,
    ruleset_version, version, status, request_id, correction_reason, corrected_by
  )
  values (
    v_original.match_id, p_games_won_a, p_games_won_b, v_winner_membership_id, v_original.submitted_by,
    v_ruleset_version, v_original.version + 1, 'OFFICIAL', p_request_id, p_reason, v_user_id
  )
  returning id into v_new_result_id;

  v_result := jsonb_build_object(
    'status', 'corrected',
    'resultId', v_new_result_id,
    'version', v_original.version + 1,
    'winnerMembershipId', v_winner_membership_id
  );

  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'correct_result', p_result_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (v_user_id, 'correct_result', 'result', p_result_id, 'SUCCESS', p_request_id, v_result);

  return v_result;
end;
$$;

grant execute on function public.correct_result(uuid, uuid, int, int, int, text) to authenticated;
