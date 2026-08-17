-- security_alerts.sql
-- GREEN suite for 0021_verify_remediation.sql (A): proves the
-- platform-foundation spec "Audit and operational evidence" scenario
-- "Failed or suspicious action" — authorization failures, retry
-- conflicts, and dependency outages recorded in audit_events are
-- *alerted* (elevated into security_alerts with a sanitized payload)
-- and remain admin-read-only, without exposing credentials or sensitive
-- payloads.

begin;

select plan(10);

insert into auth.users (id, email) values
  ('f5000000-0000-0000-0000-000000000001', 'secalert-admin@example.com'),
  ('f5000000-0000-0000-0000-000000000002', 'secalert-user@example.com');

insert into public.user_roles (user_id, role) values
  ('f5000000-0000-0000-0000-000000000001', 'admin');

-- ---------------------------------------------------------------------
-- DENIED audit event -> exactly one HIGH alert, sensitive payload keys
-- stripped even though the (hypothetically accidental) details carried
-- them.
-- ---------------------------------------------------------------------

insert into public.audit_events (actor_id, action, entity_type, outcome, details)
values (
  'f5000000-0000-0000-0000-000000000002',
  'advance_tournament_state',
  'tournament',
  'DENIED',
  '{"token":"should-not-survive","password":"also-not","reason":"role_check_failed","request_id":"ctx"}'::jsonb
);

select is(
  (select count(*)::int from public.security_alerts),
  1,
  'a DENIED audit event elevates exactly one security alert'
);

select is(
  (select severity from public.security_alerts limit 1),
  'HIGH',
  'DENIED outcomes elevate with HIGH severity'
);

select is(
  (select reason from public.security_alerts limit 1),
  'advance_tournament_state:DENIED',
  'alert reason names the action and outcome'
);

select is(
  (select payload ? 'token' from public.security_alerts limit 1),
  false,
  'sensitive key "token" is stripped from the alert payload'
);

select is(
  (select payload ? 'password' from public.security_alerts limit 1),
  false,
  'sensitive key "password" is stripped from the alert payload'
);

select is(
  (select payload ->> 'reason' from public.security_alerts limit 1),
  'role_check_failed',
  'non-sensitive context survives sanitization'
);

-- ---------------------------------------------------------------------
-- FAILURE -> MEDIUM alert; SUCCESS -> no alert.
-- ---------------------------------------------------------------------

insert into public.audit_events (action, entity_type, outcome, details)
values
  ('submit_official_result', 'match', 'FAILURE', '{"reason":"dependency_outage"}'::jsonb),
  ('claim_username', 'profile', 'SUCCESS', '{"reason":"ok"}'::jsonb);

select is(
  (select count(*)::int from public.security_alerts),
  2,
  'a FAILURE elevates one more alert; SUCCESS elevates none'
);

select is(
  (select severity from public.security_alerts where reason = 'submit_official_result:FAILURE'),
  'MEDIUM',
  'FAILURE (non-denial) outcomes elevate with MEDIUM severity'
);

-- ---------------------------------------------------------------------
-- RLS: authenticated non-admin cannot read or fabricate alerts.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'f5000000-0000-0000-0000-000000000002';

select is_empty(
  $$ select 1 from public.security_alerts $$,
  'authenticated non-admin sees no rows in security_alerts (admin-only read)'
);

select throws_ok(
  $$ insert into public.security_alerts (audit_event_id, severity, reason) values ('00000000-0000-0000-0000-000000000001', 'HIGH', 'forged') $$,
  '42501',
  null,
  'authenticated non-admin cannot fabricate alerts (no insert grant/policy)'
);

reset role;

select * from finish();
