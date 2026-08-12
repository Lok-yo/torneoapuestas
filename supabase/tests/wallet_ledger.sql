BEGIN;
SELECT plan(6);

-- Setup test users
INSERT INTO auth.users (id, email) VALUES
  ('e7000000-0000-0000-0000-000000000001', 'wallet_user1@example.com'),
  ('e7000000-0000-0000-0000-000000000002', 'wallet_user2@example.com');

-- 1. Get or create wallet grants welcome bonus
SET LOCAL row_security = on;
SET LOCAL "request.jwt.claims" TO '{"sub": "e7000000-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT results_eq(
  'SELECT balance, locked_balance, available_balance FROM public.get_or_create_wallet()',
  'VALUES (100.00::numeric, 0.00::numeric, 100.00::numeric)',
  'get_or_create_wallet creates wallet with 100 welcome bonus'
);

-- 2. Transaction history shows INITIAL_BONUS
SELECT results_eq(
  'SELECT type, amount, status FROM public.wallet_transactions WHERE user_id = ''e7000000-0000-0000-0000-000000000001''',
  'VALUES (''INITIAL_BONUS'', 100.00::numeric, ''COMPLETED'')',
  'wallet_transactions records initial bonus'
);

-- 3. Deposit funds credits balance
SELECT results_eq(
  'SELECT balance, locked_balance, available_balance FROM public.deposit_funds(50.00, ''ref_test_123'')',
  'VALUES (150.00::numeric, 0.00::numeric, 150.00::numeric)',
  'deposit_funds increases balance to 150'
);

-- 4. Withdraw funds debits balance
SELECT results_eq(
  'SELECT balance, locked_balance, available_balance FROM public.withdraw_funds(30.00, ''bank_payout_1'')',
  'VALUES (120.00::numeric, 0.00::numeric, 120.00::numeric)',
  'withdraw_funds decreases balance to 120'
);

-- 5. Overdraft withdrawal is rejected with INSUFFICIENT_FUNDS
SELECT throws_ok(
  'SELECT public.withdraw_funds(1000.00, ''excess_payout'')',
  '22003',
  NULL,
  'overdraft withdrawal raises insufficient funds error'
);

-- 6. RLS: User 2 cannot see User 1 transactions
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "e7000000-0000-0000-0000-000000000002", "role": "authenticated"}';
SELECT public.get_or_create_wallet();

SELECT is_empty(
  'SELECT * FROM public.wallet_transactions WHERE user_id = ''e7000000-0000-0000-0000-000000000001''',
  'User 2 cannot select User 1 transactions'
);

SELECT * FROM finish();
ROLLBACK;
