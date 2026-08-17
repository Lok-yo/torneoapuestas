-- 0021_verify_remediation.sql
-- Closes the two PARTIAL scenarios left by the Stage 1 verification
-- report (openspec/changes/production-ready-tournament-betting-platform/
-- verify-report.md, Remediation Addendum §3):
--
--   A) platform-foundation "Audit and operational evidence" / scenario
--      "Failed or suspicious action": failures and denials recorded in
--      audit_events are now *alerted* (elevated into an operator-facing
--      security_alerts queue with a sanitized payload), not only logged.
--
--   B) legacy-migration-controls "Migration audit and rollback
--      evidence" / scenario "Retry or concurrent migration":
--      record_migration_event() gains an optional request_id so a
--      retried/interrupted migration step replays at-most-once, and the
--      previously writer-less ROLLBACK/RECONCILIATION event types become
--      first-class recordable operations.
--
-- Same conventions as every earlier migration: SECURITY DEFINER with an
-- explicit search_path, revoke-then-grant, deny-by-default RLS, and no
-- client-role INSERT/UPDATE/DELETE path on any audit table.

-- =====================================================================
-- A) Security alerts
-- =====================================================================

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  audit_event_id uuid not null references public.audit_events (id),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint security_alerts_payload_bounded check (char_length(payload::text) <= 2000)
);

create index security_alerts_created_at_idx on public.security_alerts (created_at);
create index security_alerts_severity_idx on public.security_alerts (severity) where resolved_at is null;

comment on table public.security_alerts is
  'Operator-facing alert queue elevated from FAILED/DENIED audit_events. Filled only by the security_audit_alert_trg trigger; admin-read-only; payload is sanitized (sensitive top-level keys stripped). See platform-foundation spec "Audit and operational evidence".';

-- RLS: same pattern as migration_events (0014). The default privileges
-- on the public schema would grant anon/authenticated full CRUD on this
-- new table; revoke first, then grant exactly one thing: admin-only read.

revoke all on public.security_alerts from anon, authenticated;

alter table public.security_alerts enable row level security;

grant select on public.security_alerts to authenticated;

create policy security_alerts_select_admin on public.security_alerts
  for select
  to authenticated
  using (public.has_role('admin'));

-- Trigger: elevate every FAILED/DENIED audit event into an alert with a
-- sanitized payload. Runs inside the SECURITY DEFINER RPCs that insert
-- into audit_events, so it never depends on the caller's own grants.
-- SECURITY DEFINER + search_path pinned per the repository SQL rules.

create or replace function public.handle_security_audit_alert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
begin
  -- Defense-in-depth sanitization: audit details never intentionally
  -- carry credentials, but a future caller's "details" could acciden-
  -- tally include one. Strip sensitive top-level keys before persisting
  -- an operator-visible copy. (Spec scenario: "without exposing
  -- credentials or sensitive payloads".)
  v_payload := coalesce(new.details, '{}'::jsonb)
    - array[
        'token', 'tokens', 'password', 'passwd', 'secret', 'secrets',
        'key', 'keys', 'authorization', 'jwt', 'credential',
        'credentials', 'api_key', 'apikey', 'service_role'
      ];

  insert into public.security_alerts (audit_event_id, severity, reason, payload)
  values (
    new.id,
    case when new.outcome = 'DENIED' then 'HIGH' else 'MEDIUM' end,
    new.action || ':' || new.outcome,
    v_payload
  );

  return new;
end;
$$;

create trigger security_audit_alert_trg
  after insert on public.audit_events
  for each row
  when (new.outcome in ('FAILURE', 'DENIED'))
  execute function public.handle_security_audit_alert();

-- =====================================================================
-- B) Retry-safe migration events
-- =====================================================================

alter table public.migration_events add column request_id uuid;

-- Partial unique index: at-most-once per explicit request_id. NULL
-- (legacy call shape / non-idempotent contexts) stays unconstrained.
create unique index migration_events_request_id_uidx
  on public.migration_events (request_id)
  where request_id is not null;

-- Replace the 3-arg RPC with an idempotent 4-arg version. Dropping and
-- recreating (instead of overloading) keeps exactly one call target and
-- forces the re-grant below, so no caller silently keeps the old,
-- non-idempotent resolution.

drop function public.record_migration_event(text, text, jsonb);

create or replace function public.record_migration_event(
  p_event_type text,
  p_adapter text,
  p_detail jsonb default '{}'::jsonb,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if p_event_type is null or p_adapter is null then
    raise exception 'VALIDATION_ERROR: event_type and adapter are required' using errcode = '22023';
  end if;

  insert into public.migration_events (event_type, adapter, actor_id, detail, request_id)
  values (p_event_type, p_adapter, v_user_id, coalesce(p_detail, '{}'::jsonb), p_request_id)
  on conflict (request_id) where request_id is not null do nothing
  returning id into v_id;

  -- Replay of an already-recorded request: return the original row's id
  -- and mark it as an idempotent replay (same outcome, no second row).
  -- Spec scenario "Retry or concurrent migration": each record is
  -- migrated at most once and the final state stays auditable.
  if v_id is null and p_request_id is not null then
    select id into v_id
    from public.migration_events
    where request_id = p_request_id;

    return jsonb_build_object('status', 'recorded', 'id', v_id, 'idempotent_replay', true);
  end if;

  return jsonb_build_object('status', 'recorded', 'id', v_id);
end;
$$;

grant execute on function public.record_migration_event(text, text, jsonb, uuid) to authenticated, anon;
