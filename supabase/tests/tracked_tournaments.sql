-- tracked_tournaments.sql
-- RED contract for the curated tournament registry. The migration must keep
-- the registry private, expose only its allowlisted view, and make tracking
-- plus admin lifecycle operations explicit and idempotent.

begin;

select plan(15);

insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000001', 'tracked-submitter@example.com'),
  ('a9000000-0000-0000-0000-000000000002', 'tracked-admin@example.com');

insert into public.user_roles (user_id, role)
values ('a9000000-0000-0000-0000-000000000002', 'admin')
on conflict (user_id, role) do nothing;

insert into public.tournaments (id, organizer_id, game_id, format_id, name, status, startgg_event_id)
values
  ('b9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'ssbu', '00000000-0000-0000-0000-000000000001', 'Tracked Published Fixture', 'IN_PROGRESS', 990001),
  ('b9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000001', 'ssbu', '00000000-0000-0000-0000-000000000001', 'Tracked Draft Fixture', 'DRAFT', 990002),
  ('b9000000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000001', 'ssbu', '00000000-0000-0000-0000-000000000001', 'Tracked Second Fixture', 'IN_PROGRESS', 990003);

-- The migration's seed shape must be safe to replay and must not create a
-- second registry row when an event is already present.
insert into public.tracked_tournaments (tournament_id, startgg_event_id, submitted_by)
values ('b9000000-0000-0000-0000-000000000001', 990001, 'a9000000-0000-0000-0000-000000000001')
on conflict (startgg_event_id) do nothing;
insert into public.tracked_tournaments (tournament_id, startgg_event_id, submitted_by)
values ('b9000000-0000-0000-0000-000000000001', 990001, 'a9000000-0000-0000-0000-000000000001')
on conflict (startgg_event_id) do nothing;

select is(
  (select count(*)::int from public.tracked_tournaments where startgg_event_id = 990001),
  1,
  'replaying the seed shape is idempotent'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tracked_tournaments'::regclass),
  'tracked_tournaments has RLS enabled'
);

select is(
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'tracked_tournaments_view' and column_name = 'submitted_by'),
  0,
  'the public tracked view does not expose submitter attribution'
);

set local role anon;

select throws_ok(
  $$ select 1 from public.tracked_tournaments $$,
  '42501',
  null,
  'anon cannot read the private tracked registry'
);

select is(
  (select count(*)::int from public.tracked_tournaments_view where startgg_event_id in (990001, 990003)),
  1,
  'anon reads a published tracked tournament through the view'
);

select is(
  (select count(*)::int from public.tracked_tournaments_view where id = 'b9000000-0000-0000-0000-000000000002'),
  0,
  'draft tournaments stay out of the public tracked view'
);

reset role;
set local role authenticated;
reset "request.jwt.claim.sub";

select throws_ok(
  $$ select public.add_tournament_by_link(990003, 'b9000000-0000-0000-0000-000000000001'::uuid) $$,
  '28000',
  null,
  'the tracking RPC rejects an authenticated role without a caller identity'
);

select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);

select is(
  (public.add_tournament_by_link(990001, 'b9000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'already_tracked',
  'duplicate tracking returns explicit already_tracked feedback'
);

select is(
  (public.add_tournament_by_link(990003, 'b9000000-0000-0000-0000-000000000003'::uuid) ->> 'status'),
  'tracked',
  'an authenticated caller can track a validated event'
);

select is(
  (select count(*)::int from public.tracked_tournaments_view where startgg_event_id in (990001, 990003)),
  2,
  'each distinct event is represented once in the registry'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.move_tracked_tournament('b9000000-0000-0000-0000-000000000001'::uuid, 'finalizados') $$,
  '42501',
  null,
  'a non-admin cannot manually move a tracked tournament'
);

select throws_ok(
  $$ select public.delete_tracked_tournament('b9000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  null,
  'a non-admin cannot delete a tracked tournament'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000002', true);

select is(
  (public.move_tracked_tournament('b9000000-0000-0000-0000-000000000001'::uuid, 'finalizados') ->> 'status'),
  'moved',
  'an admin can move a tracked tournament to finalizados'
);

select is(
  (select list from public.tracked_tournaments_view where id = 'b9000000-0000-0000-0000-000000000001' and startgg_event_id = 990001),
  'finalizados',
  'admin move persists the finalizados list'
);

select is(
  (public.delete_tracked_tournament('b9000000-0000-0000-0000-000000000001'::uuid) ->> 'status'),
  'deleted',
  'an admin can delete tracked tournaments'
);

reset role;

select * from finish();

rollback;
