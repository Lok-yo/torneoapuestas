-- 0014_migration_audit.sql
-- Append-only migration/rollback audit trail: closes the
-- legacy-migration-controls spec "Migration audit and rollback evidence"
-- gap flagged during the Phase 5 deferral review. Distinct from
-- audit_events (which records domain command outcomes): migration_events
-- records the *meta* layer -- adapter-flag state and adapter-dependency
-- errors observed by the client-side environment-scoped flags in
-- src/config/featureFlags.js (see tasks.md 5.2/5.4).
--
-- Written only through record_migration_event(), a SECURITY DEFINER RPC,
-- the same pattern as every other write RPC in this schema (see
-- 0009_registration_rpc.sql). No INSERT grant/policy exists for anon or
-- authenticated on the table itself, so the audit trail cannot be
-- fabricated or bypassed by a direct PostgREST table write. No
-- UPDATE/DELETE grant or policy exists for any client role either
-- (append-only, same as audit_events).
--
-- anon MAY call this RPC: an adapter can fail (e.g. the identity adapter
-- itself) before any session exists, and that failure must still be
-- observable. actor_id is populated from auth.uid() when a session is
-- present and left null otherwise -- never trusted from client input.

create table public.migration_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('FLAG_CHANGE', 'ADAPTER_ERROR', 'ROLLBACK', 'RECONCILIATION')),
  adapter text not null check (adapter in ('identity', 'tournaments', 'ratings', 'demoFinancialUI')),
  actor_id uuid references auth.users (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint migration_events_detail_bounded check (char_length(detail::text) <= 2000)
);

create index migration_events_adapter_idx on public.migration_events (adapter, event_type);
create index migration_events_created_at_idx on public.migration_events (created_at);

comment on table public.migration_events is
  'Append-only audit trail for adapter flag state and adapter-dependency errors observed by the client. Written only via record_migration_event(). See legacy-migration-controls spec "Migration audit and rollback evidence".';

-- ---------------------------------------------------------------------
-- RLS: admin-only read, same pattern as audit_events (0004). No client
-- role has any INSERT/UPDATE/DELETE grant -- writes happen only through
-- the SECURITY DEFINER RPC below, which bypasses RLS as the table owner.
--
-- The public schema's default privileges grant anon/authenticated full
-- CRUD on any new table (same fact 0004_rls_policies.sql documents and
-- revokes for 0001-0003's tables); this table is created after that
-- migration, so it needs its own explicit revoke-then-grant, or anon/
-- authenticated would inherit ALL on it by default despite RLS being
-- enabled and no policy existing for INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------

revoke all on public.migration_events from anon, authenticated;

alter table public.migration_events enable row level security;
grant select on public.migration_events to authenticated;

create policy migration_events_select_admin on public.migration_events
  for select
  to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- record_migration_event: the sole write path. Best-effort from the
-- caller's perspective (client repositories never let a failure here
-- block the primary flow it describes -- see
-- src/repositories/migrationEventRepository.js), but the write itself is
-- a normal, retry-safe insert; nothing here is a financial or
-- competition record.
-- ---------------------------------------------------------------------

create or replace function public.record_migration_event(p_event_type text, p_adapter text, p_detail jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if p_event_type is null or p_adapter is null then
    raise exception 'VALIDATION_ERROR: event_type and adapter are required' using errcode = '22023';
  end if;

  insert into public.migration_events (event_type, adapter, actor_id, detail)
  values (p_event_type, p_adapter, v_user_id, coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('status', 'recorded', 'id', v_id);
end;
$$;

grant execute on function public.record_migration_event(text, text, jsonb) to authenticated, anon;
