-- rls_deny_by_default.sql
-- RED (now GREEN against 0004_rls_policies.sql / 0005_public_views.sql):
-- proves anon and other-authenticated-user access to private tables is
-- denied by default. See tasks.md 1.6 and platform-foundation spec
-- "Least-privilege data access".

begin;

select plan(8);

-- ---------------------------------------------------------------------
-- Seed fixtures as postgres (table owner; bypasses RLS).
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rls-other@example.com');

insert into public.profiles (user_id, username, username_normalized, display_name)
values ('11111111-1111-1111-1111-111111111111', 'rlsowner', 'rlsowner', 'RLS Owner');

insert into public.games (id, name) values ('ssbu', 'Super Smash Bros. Ultimate');

insert into public.tournament_formats (id, game_id, name, roster_size, best_of, ruleset)
values ('33333333-3333-3333-3333-333333333333', 'ssbu', 'Singles', 8, 3, '{}'::jsonb);

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'ssbu',
  '33333333-3333-3333-3333-333333333333',
  'RLS Fixture Tournament',
  'DRAFT'
);

insert into public.memberships (tournament_id, user_id)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');

insert into public.audit_events (actor_id, action, entity_type, entity_id, outcome)
values ('11111111-1111-1111-1111-111111111111', 'test.seed', 'tournament', '44444444-4444-4444-4444-444444444444', 'SUCCESS');

insert into public.command_outcomes (request_id, command_name, actor_id, outcome)
values ('55555555-5555-5555-5555-555555555555', 'test.seed', '11111111-1111-1111-1111-111111111111', '{}'::jsonb);

-- ---------------------------------------------------------------------
-- anon: no session, no auth.uid(), and no table-level grant at all on
-- any of these private tables (revoked in 0004_rls_policies.sql), so
-- every read is a hard permission error, not merely an empty result.
-- ---------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select 1 from public.profiles $$,
  '42501',
  null,
  'anon is denied (permission error) on profiles'
);

select throws_ok(
  $$ select 1 from public.memberships $$,
  '42501',
  null,
  'anon is denied (permission error) on memberships'
);

select throws_ok(
  $$ select 1 from public.audit_events $$,
  '42501',
  null,
  'anon is denied (permission error) on audit_events'
);

select throws_ok(
  $$ select 1 from public.command_outcomes $$,
  '42501',
  null,
  'anon is denied (permission error) on command_outcomes'
);

reset role;

-- ---------------------------------------------------------------------
-- authenticated "other" user: has a valid session, but is neither the
-- profile owner, the membership holder, nor an admin/organizer.
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'other authenticated user cannot read owner profile row'
);

select is_empty(
  $$ select 1 from public.memberships where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'other authenticated user cannot read owner membership row'
);

select is_empty(
  $$ select 1 from public.audit_events $$,
  'other authenticated (non-admin) user sees no rows in audit_events'
);

select throws_ok(
  $$ select 1 from public.command_outcomes $$,
  '42501',
  null,
  'other authenticated user is denied (permission error) on command_outcomes'
);

reset role;

select * from finish();

rollback;
