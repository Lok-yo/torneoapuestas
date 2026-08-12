BEGIN;
SELECT plan(7);

-- Setup test users
INSERT INTO auth.users (id, email) VALUES
  ('d7000000-0000-0000-0000-000000000001', 'market_org@example.com'),
  ('d7000000-0000-0000-0000-000000000002', 'market_bettor@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d7000000-0000-0000-0000-000000000001', 'organizer'),
  ('d7000000-0000-0000-0000-000000000002', 'user')
ON CONFLICT (user_id, role) DO NOTHING;

-- 1. Organizer creates market with binary outcomes
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "d7000000-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT is(
  (SELECT status FROM public.create_prediction_market(NULL, '¿Gana Jugador 1 el torneo?')),
  'OPEN',
  'organizer creates prediction market in OPEN status'
);

-- 2. Check binary outcomes created automatically
SELECT is(
  (SELECT count(*)::integer FROM public.market_outcomes WHERE market_id = (SELECT id FROM public.markets LIMIT 1)),
  2,
  'prediction market automatically creates 2 binary outcomes (Sí / No)'
);

-- 3. Bettor buys shares (SÍ option)
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "d7000000-0000-0000-0000-000000000002", "role": "authenticated"}';

SELECT is(
  (SELECT total_cost FROM public.buy_market_shares(
    (SELECT id FROM public.markets LIMIT 1),
    (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1),
    10.00
  )),
  5.00::numeric,
  'bettor buys 10 shares at 0.50 price costing $5.00'
);

-- 4. Check position created for bettor
SELECT is(
  (SELECT shares FROM public.market_positions WHERE user_id = 'd7000000-0000-0000-0000-000000000002' LIMIT 1),
  10.00::numeric,
  'bettor has 10 shares in position'
);

-- 5. Non-organizer cannot resolve market
SELECT throws_ok(
  format(
    'SELECT public.resolve_market(''%s'', ''%s'')',
    (SELECT id FROM public.markets LIMIT 1),
    (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1)
  ),
  '42501',
  NULL,
  'regular user cannot resolve market'
);

-- 6. Organizer resolves market paying out $1.00 per share ($10.00 total)
SET LOCAL "request.jwt.claims" TO '{"sub": "d7000000-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT is(
  (SELECT total_payout FROM public.resolve_market(
    (SELECT id FROM public.markets LIMIT 1),
    (SELECT id FROM public.market_outcomes WHERE label = 'Sí' LIMIT 1)
  )),
  10.00::numeric,
  'organizer resolves market paying out $10.00 to winning position'
);

-- 7. Auto-resolution on tournament completion
INSERT INTO public.tournaments (id, organizer_id, game_id, format_id, name, status)
VALUES ('e7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'ssbu', '00000000-0000-0000-0000-000000000001', 'Torneo Auto Resolve', 'IN_PROGRESS');

SELECT public.create_prediction_market('e7000000-0000-0000-0000-000000000001', '¿Mercado Auto Resolve?');

SELECT public.advance_tournament_state(gen_random_uuid(), 'e7000000-0000-0000-0000-000000000001', 'COMPLETE', 1);

SELECT is(
  (SELECT status FROM public.markets WHERE tournament_id = 'e7000000-0000-0000-0000-000000000001' LIMIT 1),
  'RESOLVED',
  'tournament completion trigger automatically resolves open prediction markets'
);

SELECT * FROM finish();
ROLLBACK;
