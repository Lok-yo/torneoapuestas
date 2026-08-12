-- 0012_rating_projector_trigger.sql
-- Rating projection: append-only rating_events + deterministically
-- recomputed rating_snapshots, derived strictly from accepted official
-- results. See tasks.md 4.2/4.4 and rating-projections spec
-- "Official-result rating events" / "Deterministic and retry-safe
-- processing".
--
-- Design: an AFTER INSERT trigger on public.results (fires for both
-- submit_official_result's original insert and correct_result's
-- corrective insert, 0013 — one projector, not duplicated per caller).
-- It only acts when the inserted row's status = 'OFFICIAL' (the
-- currently-active version); a row inserted with status other than
-- 'OFFICIAL' would never happen today (submit_official_result/
-- correct_result only ever insert OFFICIAL rows), but the guard keeps
-- "unofficial/simulated input produces no rating event" true even if a
-- future write path inserts a non-authoritative row.
--
-- Idempotency: results.id is a primary key, so a given result row can
-- only ever trigger this function once — the real retry-safety already
-- comes from submit_official_result/correct_result's own command_outcomes
-- ledger, which prevents a retried request_id from inserting a second
-- results row at all. This trigger adds its own defense-in-depth via a
-- unique (result_id, participant_membership_id) constraint plus
-- `on conflict do nothing`, so even a hypothetical direct re-invocation
-- can never duplicate a rating_events row for the same result+participant.
--
-- Conflict handling: "conflicting source versions" (rating-projections
-- spec "Conflicting history") is resolved by correct_result (0013) via an
-- optimistic-concurrency expected_version check *before* it ever inserts a
-- competing results row — so this trigger never observes two live
-- interpretations of the same match at once. review_state stays 'CLEAN'
-- for every event this trigger inserts; correct_result is the only writer
-- of 'NEEDS_REVIEW', on the losing side of a version conflict.

alter table public.rating_events
  add constraint rating_events_result_participant_uniq unique (result_id, participant_membership_id);

-- Deterministic, fixed-magnitude win/loss scoring signal (Stage 1 has no
-- ELO curve or predictions). Mirrors src/domain/ratings/projector.js
-- WIN_DELTA/LOSE_DELTA exactly.
create or replace function public.recompute_rating_snapshot(p_user_id uuid, p_game_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rating numeric;
begin
  -- Deterministic recompute from retained events: sum every CLEAN
  -- rating_event delta for this user/game whose source result is still
  -- the currently-active (OFFICIAL) version of its match. A superseded
  -- ('CORRECTED') result's events remain in the table for audit but are
  -- excluded here — corrections never erase history, they only stop
  -- counting toward the live snapshot. See rating-projections spec
  -- "Correction and historical auditability".
  select coalesce(sum(re.delta), 0) + 1000
  into v_rating
  from public.rating_events re
  join public.memberships m on m.id = re.participant_membership_id
  join public.results r on r.id = re.result_id
  where m.user_id = p_user_id
    and re.game_id = p_game_id
    and re.review_state = 'CLEAN'
    and r.status = 'OFFICIAL';

  insert into public.rating_snapshots (user_id, game_id, rating, version, computed_at)
  values (p_user_id, p_game_id, v_rating, 1, now())
  on conflict (user_id, game_id) do update
    set rating = excluded.rating,
        version = public.rating_snapshots.version + 1,
        computed_at = excluded.computed_at;
end;
$$;

create or replace function public.project_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_loser_membership_id uuid;
  v_winner_user_id uuid;
  v_loser_user_id uuid;
begin
  if new.status <> 'OFFICIAL' then
    -- Unofficial/simulated/draft rows never produce a rating event.
    return new;
  end if;

  select * into v_match from public.matches where id = new.match_id;
  select * into v_tournament from public.tournaments where id = v_match.tournament_id;

  v_loser_membership_id := case
    when new.winner_membership_id = v_match.participant_a_membership_id then v_match.participant_b_membership_id
    else v_match.participant_a_membership_id
  end;

  insert into public.rating_events (
    result_id, participant_membership_id, game_id, ruleset_version, delta, version, review_state, effective_at
  )
  values
    (new.id, new.winner_membership_id, v_tournament.game_id, new.ruleset_version, 25, new.version, 'CLEAN', new.created_at),
    (new.id, v_loser_membership_id, v_tournament.game_id, new.ruleset_version, -25, new.version, 'CLEAN', new.created_at)
  on conflict (result_id, participant_membership_id) do nothing;

  select user_id into v_winner_user_id from public.memberships where id = new.winner_membership_id;
  select user_id into v_loser_user_id from public.memberships where id = v_loser_membership_id;

  perform public.recompute_rating_snapshot(v_winner_user_id, v_tournament.game_id);
  perform public.recompute_rating_snapshot(v_loser_user_id, v_tournament.game_id);

  return new;
end;
$$;

create trigger results_project_rating_event
  after insert on public.results
  for each row
  execute function public.project_rating_event();
