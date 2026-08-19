-- audit_fixes.sql
-- GREEN suite for 0022_audit_fixes_and_security_hardening.sql:
-- Proves:
-- 1. resolve_market ownership check: an organizer CANNOT resolve markets for a
--    tournament owned by another organizer.
-- 2. buy_market_shares weighted avg_price recalculation on position upsert.

begin;

select plan(5);

insert into auth.users (id, email) values
  ('f7000000-0000-0000-0000-000000000001', 'org_a@example.com'),
  ('f7000000-0000-0000-0000-000000000002', 'org_b@example.com'),
  ('f7000000-0000-0000-0000-000000000003', 'trader@example.com')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f7000000-0000-0000-0000-000000000001', 'organizer'),
  ('f7000000-0000-0000-0000-000000000002', 'organizer'),
  ('f7000000-0000-0000-0000-000000000003', 'user')
on conflict (user_id, role) do nothing;

-- Setup tournament A owned by Organizer A
insert into public.tournaments (id, game_id, format_id, name, organizer_id, status)
values ('70000000-0000-0000-0000-000000000001', 'ssbu', '00000000-0000-0000-0000-000000000001', 'Torneo Org A', 'f7000000-0000-0000-0000-000000000001', 'REGISTRATION_OPEN');

-- Setup market A owned by Organizer A / Tournament A
insert into public.markets (id, tournament_id, question, status, created_by)
values ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '¿Gana Org A?', 'OPEN', 'f7000000-0000-0000-0000-000000000001');

insert into public.market_outcomes (id, market_id, label, price, total_shares)
values
  ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Sí', 0.5000, 0),
  ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'No', 0.5000, 0);

-- ---------------------------------------------------------------------
-- 1. Organizer B tries to resolve Organizer A's market -> FORBIDDEN (42501)
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f7000000-0000-0000-0000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to 'f7000000-0000-0000-0000-000000000002';

select throws_ok(
  $$ select public.resolve_market('80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'Organizer B is denied resolving Organizer A market'
);

-- ---------------------------------------------------------------------
-- 2. Trader buys 10 shares at 0.50 -> avg_price = 0.5000
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f7000000-0000-0000-0000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to 'f7000000-0000-0000-0000-000000000003';

select public.buy_market_shares('80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 10);

select is(
  (select avg_price::numeric(5,4) from public.market_positions where user_id = 'f7000000-0000-0000-0000-000000000003' and outcome_id = '90000000-0000-0000-0000-000000000001'),
  0.5000,
  'first purchase avg_price records initial price'
);

-- Trader buys 10 more shares at the new price (which increased to 0.5500 after the first buy)
select public.buy_market_shares('80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 10);

select is(
  (select avg_price::numeric(5,4) from public.market_positions where user_id = 'f7000000-0000-0000-0000-000000000003' and outcome_id = '90000000-0000-0000-0000-000000000001'),
  0.5250,
  'second purchase recalculates weighted average price: (10*0.50 + 10*0.55) / 20 = 0.5250'
);

-- ---------------------------------------------------------------------
-- 3. Organizer A resolves market A -> SUCCEEDS
-- ---------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f7000000-0000-0000-0000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to 'f7000000-0000-0000-0000-000000000001';

select is(
  (select status from public.resolve_market('80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001')),
  'RESOLVED',
  'Organizer A successfully resolves own market'
);

select * from finish();
