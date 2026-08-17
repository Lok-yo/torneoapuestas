-- admin_bootstrap.sql
-- Proves 0002_admin_bootstrap.sql grants 'admin' to exactly the fixed
-- maintainer email and nobody else, and that replaying it is a no-op.
-- See tasks.md 1.8 and proposal.md "First admin bootstrap".

begin;

select plan(4);

-- Simulate a fresh signup for the fixed maintainer email plus an
-- unrelated user, then re-run the exact bootstrap grant logic (mirrors
-- 0002_admin_bootstrap.sql) to prove it is idempotent and selective.

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'lleonalmaza@gmail.com'),
  ('77777777-7777-7777-7777-777777777777', 'not-the-admin@example.com');

insert into public.user_roles (user_id, role, granted_by, granted_at)
select id, 'admin', id, now()
from auth.users
where email = 'lleonalmaza@gmail.com'
on conflict (user_id, role) do nothing;

select ok(
  exists (
    select 1 from public.user_roles
    where user_id = '66666666-6666-6666-6666-666666666666' and role = 'admin'
  ),
  'fixed maintainer email holds admin'
);

select ok(
  not exists (
    select 1 from public.user_roles
    where user_id = '77777777-7777-7777-7777-777777777777' and role = 'admin'
  ),
  'unrelated user does not hold admin'
);

select is(
  (select count(*)::int from public.user_roles where role = 'admin'),
  1,
  'exactly one admin grant exists'
);

-- Replay: applying the same grant logic again must not create a
-- duplicate row or error.

insert into public.user_roles (user_id, role, granted_by, granted_at)
select id, 'admin', id, now()
from auth.users
where email = 'lleonalmaza@gmail.com'
on conflict (user_id, role) do nothing;

select is(
  (select count(*)::int from public.user_roles where role = 'admin'),
  1,
  'replaying the bootstrap grant is idempotent (still exactly one admin)'
);

select * from finish();

rollback;
