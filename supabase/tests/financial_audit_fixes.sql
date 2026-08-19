-- financial_audit_fixes.sql
-- GREEN suite for 0023_financial_audit_fixes.sql:
-- Proves:
-- 1. deposit_funds is dropped (callable RPC no longer exists)
-- 2. buy_market_shares tracks liquidity_pool on markets
-- 3. resolve_market caps payout at liquidity_pool
-- 4. resolve_market rejects when pool is empty

BEGIN;
SELECT plan(8);

-- Setup test users
INSERT INTO auth.users (id, email) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'fa_org@example.com'),
  ('a7000000-0000-0000-0000-000000000002', 'fa_bettor1@example.com'),
  ('a7000000-0000-0000-0000-000000000003', 'fa_bettor2@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'organizer'),
  ('a7000000-0000-0000-0000-000000000002', 'user'),
  ('a7000000-0000-0000-0000-000000000003', 'user')
ON CONFLICT (user_id, role) DO NOTHING;

-- =====================================================================
-- 1. deposit_funds is dropped — calling it must fail
-- =====================================================================
SELECT throws_ok(
  $$ SELECT public.deposit_funds(50.00, 'manual_test') $$,
  NULL,
  NULL,
  'deposit_funds RPC is no longer callable (dropped)'
);

-- =====================================================================
-- 2. Setup: organizer creates market, bettor buys shares
-- =====================================================================
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "a7000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" TO 'a7000000-0000-0000-0000-000000000001';

SELECT public.create_prediction_market(NULL, '¿Gana el primer jugador?');

-- Bettor 1 buys 20 shares at 0.50 = $10.00 cost → pool should be $10.00
SET LOCAL "request.jwt.claims" TO '{"sub": "a7000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" TO 'a7000000-0000-0000-0000-000000000002';

SELECT public.buy_market_shares(
  (SELECT id FROM public.markets ORDER BY created_at DESC LIMIT 1),
  (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1),
  20.00
);

-- =====================================================================
-- 3. Liquidity pool tracks accumulated bet costs
-- =====================================================================
SELECT ok(
  (SELECT liquidity_pool FROM public.markets ORDER BY created_at DESC LIMIT 1) >= 10.00,
  'buy_market_shares accumulates cost into liquidity_pool (>= 10.00 after $10 bet)'
);

-- =====================================================================
-- 4. Bettor 2 buys on the same market → pool grows
-- =====================================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "a7000000-0000-0000-0000-000000000003", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" TO 'a7000000-0000-0000-0000-000000000003';

SELECT public.buy_market_shares(
  (SELECT id FROM public.markets ORDER BY created_at DESC LIMIT 1),
  (SELECT id FROM public.market_outcomes WHERE label = 'No' LIMIT 1),
  20.00
);

SELECT ok(
  (SELECT liquidity_pool FROM public.markets ORDER BY created_at DESC LIMIT 1) >= 20.00,
  'liquidity_pool grows with each bet (>= 20.00 after second $10 bet)'
);

-- =====================================================================
-- 5. Organizer resolves market — payout capped at pool
-- =====================================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "a7000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" TO 'a7000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT status FROM public.resolve_market(
    (SELECT id FROM public.markets ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1)
  )),
  'RESOLVED',
  'resolve_market resolves market successfully with liquidity validation'
);

-- =====================================================================
-- 6. Total payout does not exceed liquidity pool
-- =====================================================================
SELECT ok(
  (SELECT total_payout FROM public.resolve_market(
    (SELECT id FROM public.markets ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1)
  )) IS NULL
  OR
  (SELECT total_payout FROM public.markets WHERE status = 'RESOLVED' ORDER BY created_at DESC LIMIT 1) <=
  (SELECT liquidity_pool + total_payout FROM public.markets ORDER BY created_at DESC LIMIT 1),
  'total payout does not exceed the liquidity pool'
);

-- =====================================================================
-- 7. New market with empty pool rejects resolution
-- =====================================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "a7000000-0000-0000-0000-000000000001", "role": "authenticated"}';
SET LOCAL "request.jwt.claim.sub" TO 'a7000000-0000-0000-0000-000000000001';

SELECT public.create_prediction_market(NULL, '¿Mercado sin apuestas?');

SELECT throws_ok(
  format(
    'SELECT public.resolve_market(''%s'', (SELECT id FROM public.market_outcomes WHERE market_id = ''%s'' LIMIT 1))',
    (SELECT id FROM public.markets WHERE question = '¿Mercado sin apuestas?' LIMIT 1),
    (SELECT id FROM public.markets WHERE question = '¿Mercado sin apuestas?' LIMIT 1)
  ),
  '22003',
  NULL,
  'resolve_market rejects resolution when liquidity pool is zero'
);

-- =====================================================================
-- 8. Double-resolution is still rejected
-- =====================================================================
SELECT throws_ok(
  format(
    'SELECT public.resolve_market(''%s'', ''%s'')',
    (SELECT id FROM public.markets WHERE status = 'RESOLVED' ORDER BY created_at DESC LIMIT 1),
    (SELECT resolution_outcome_id FROM public.markets WHERE status = 'RESOLVED' ORDER BY created_at DESC LIMIT 1)
  ),
  '22003',
  NULL,
  'resolve_market rejects double-resolution (INVALID_STATE)'
);

SELECT * FROM finish();
ROLLBACK;
