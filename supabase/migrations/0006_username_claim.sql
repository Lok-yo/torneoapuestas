-- 0006_username_claim.sql
-- Atomic case-insensitive username claim. See authenticated-identity spec
-- "Atomic case-insensitive username claim" and design.md sequence diagram
-- (claim-username -> Postgres: throttle+normalize+atomic uniqueness).
--
-- Concurrency safety comes from the unique btree index on
-- profiles.username_normalized: two concurrent claims for the same
-- normalized name serialize on the index, and the loser gets a
-- unique_violation caught below and turned into a stable 'conflict'
-- result rather than a duplicate profile ownership.

-- ---------------------------------------------------------------------
-- Case-insensitive uniqueness for the already-existing
-- profiles.username_normalized column (see 0003_core_tables.sql).
-- Partial index (where not null) lets a fresh profile keep no username.
-- ---------------------------------------------------------------------

create unique index profiles_username_normalized_idx
  on public.profiles (username_normalized)
  where username_normalized is not null;

-- ---------------------------------------------------------------------
-- Throttle ledger: every claim attempt (successful or not) is recorded
-- so claim_username can enforce a rolling-window abuse threshold. This
-- table is never exposed to ordinary clients — see 0004-style grants
-- below.
-- ---------------------------------------------------------------------

create table public.username_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username_input text not null,
  request_id uuid not null,
  attempted_at timestamptz not null default now()
);

create index username_claim_attempts_user_id_idx
  on public.username_claim_attempts (user_id, attempted_at);

revoke all on public.username_claim_attempts from anon, authenticated;

alter table public.username_claim_attempts enable row level security;
grant select on public.username_claim_attempts to authenticated;

create policy username_claim_attempts_select_admin on public.username_claim_attempts
  for select
  to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- claim_username(request_id, username): the only way a username is ever
-- assigned. SECURITY DEFINER so it can write profiles/command_outcomes/
-- audit_events regardless of the caller's own table grants; every write
-- is still scoped to auth.uid()'s own profile row.
-- ---------------------------------------------------------------------

create or replace function public.claim_username(p_request_id uuid, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text;
  v_existing jsonb;
  v_recent_attempts int;
  v_result jsonb;
  v_threshold constant int := 10;
  v_window constant interval := interval '15 minutes';
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: no active session' using errcode = '28000';
  end if;

  if p_request_id is null or p_username is null or length(trim(p_username)) = 0 then
    raise exception 'VALIDATION_ERROR: request_id and username are required' using errcode = '22023';
  end if;

  -- Idempotent replay: a retried request_id always returns the original
  -- outcome, whether it was a successful claim, a stable conflict, or a
  -- rate-limit denial. Replays never consume another throttle slot.
  select outcome into v_existing
  from public.command_outcomes
  where request_id = p_request_id and command_name = 'claim_username';

  if v_existing is not null then
    return v_existing;
  end if;

  -- Format validation happens before anything is recorded: a malformed
  -- request never touches the throttle ledger, so it can safely raise
  -- straight to the caller without losing any state.
  v_normalized := lower(trim(p_username));

  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'VALIDATION_ERROR: username must be 3-20 characters (letters, numbers, underscore)' using errcode = '22023';
  end if;

  -- From here on the function never raises: every well-formed attempt is
  -- recorded once, and the caller always gets a returned status
  -- ('claimed' | 'conflict' | 'rate_limited') rather than an exception,
  -- so the throttle/audit bookkeeping below is never rolled back by a
  -- later error in this same call.
  select count(*) into v_recent_attempts
  from public.username_claim_attempts
  where user_id = v_user_id and attempted_at > now() - v_window;

  insert into public.username_claim_attempts (user_id, username_input, request_id)
  values (v_user_id, p_username, p_request_id);

  if v_recent_attempts >= v_threshold then
    v_result := jsonb_build_object('status', 'rate_limited');
  else
    begin
      update public.profiles
      set username = p_username, username_normalized = v_normalized, updated_at = now()
      where user_id = v_user_id;

      v_result := jsonb_build_object(
        'status', 'claimed',
        'username', p_username,
        'usernameNormalized', v_normalized
      );
    exception when unique_violation then
      v_result := jsonb_build_object(
        'status', 'conflict',
        'usernameNormalized', v_normalized
      );
    end;
  end if;

  -- Persist the outcome once per request_id so replays are idempotent
  -- (on_conflict guards a theoretical duplicate concurrent replay).
  insert into public.command_outcomes (request_id, command_name, aggregate_id, actor_id, outcome)
  values (p_request_id, 'claim_username', v_user_id, v_user_id, v_result)
  on conflict (request_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome, request_id, details)
  values (
    v_user_id,
    'claim_username',
    'profile',
    v_user_id,
    case when (v_result ->> 'status') = 'claimed' then 'SUCCESS' else 'DENIED' end,
    p_request_id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.claim_username(uuid, text) to authenticated;
