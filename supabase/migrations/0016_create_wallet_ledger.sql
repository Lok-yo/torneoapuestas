-- Migration 0016: Real Wallet & Ledger System
-- Creates public.wallets and public.wallet_transactions with RLS and SECURITY DEFINER RPCs

-- 1. Create public.wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12, 2) NOT NULL DEFAULT 100.00 CHECK (balance >= 0),
  locked_balance numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (locked_balance >= 0 AND locked_balance <= balance),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own wallet
CREATE POLICY wallets_select_own ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Create public.wallet_transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  type text NOT NULL CHECK (type IN ('INITIAL_BONUS', 'DEPOSIT', 'WITHDRAWAL', 'BET_PLACED', 'BET_PAYOUT', 'BET_REFUND')),
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  reference_id text,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own transactions
CREATE POLICY wallet_transactions_select_own ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Grants
GRANT SELECT ON public.wallets TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;

-- 4. RPC: Get or create wallet
CREATE OR REPLACE FUNCTION public.get_or_create_wallet()
RETURNS TABLE (
  user_id uuid,
  balance numeric(12, 2),
  locked_balance numeric(12, 2),
  available_balance numeric(12, 2),
  currency text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to access wallet'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE public.wallets.user_id = v_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, locked_balance, currency)
    VALUES (v_user_id, 100.00, 0.00, 'USD')
    RETURNING * INTO v_wallet;

    INSERT INTO public.wallet_transactions (user_id, amount, type, status, description)
    VALUES (v_user_id, 100.00, 'INITIAL_BONUS', 'COMPLETED', 'Bono de bienvenida de $100 USD');
  END IF;

  RETURN QUERY
  SELECT
    v_wallet.user_id,
    v_wallet.balance,
    v_wallet.locked_balance,
    (v_wallet.balance - v_wallet.locked_balance) AS available_balance,
    v_wallet.currency,
    v_wallet.created_at;
END;
$$;

-- 5. RPC: Deposit funds
CREATE OR REPLACE FUNCTION public.deposit_funds(p_amount numeric(12, 2), p_payment_ref text)
RETURNS TABLE (
  balance numeric(12, 2),
  locked_balance numeric(12, 2),
  available_balance numeric(12, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to deposit'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Deposit amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  -- Ensure wallet exists
  PERFORM public.get_or_create_wallet();

  SELECT * INTO v_wallet FROM public.wallets WHERE public.wallets.user_id = v_user_id FOR UPDATE;

  UPDATE public.wallets
  SET balance = public.wallets.balance + p_amount,
      updated_at = now()
  WHERE public.wallets.user_id = v_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference_id, description)
  VALUES (v_user_id, p_amount, 'DEPOSIT', 'COMPLETED', p_payment_ref, 'Depósito de fondos');

  RETURN QUERY
  SELECT
    v_wallet.balance,
    v_wallet.locked_balance,
    (v_wallet.balance - v_wallet.locked_balance) AS available_balance;
END;
$$;

-- 6. RPC: Withdraw funds
CREATE OR REPLACE FUNCTION public.withdraw_funds(p_amount numeric(12, 2), p_payout_details text)
RETURNS TABLE (
  balance numeric(12, 2),
  locked_balance numeric(12, 2),
  available_balance numeric(12, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%ROWTYPE;
  v_available numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to withdraw'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Withdrawal amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.get_or_create_wallet();

  SELECT * INTO v_wallet FROM public.wallets WHERE public.wallets.user_id = v_user_id FOR UPDATE;

  v_available := v_wallet.balance - v_wallet.locked_balance;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para retirar %', p_amount
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.wallets
  SET balance = public.wallets.balance - p_amount,
      updated_at = now()
  WHERE public.wallets.user_id = v_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_transactions (user_id, amount, type, status, description)
  VALUES (v_user_id, -p_amount, 'WITHDRAWAL', 'COMPLETED', COALESCE(p_payout_details, 'Retiro de fondos'));

  RETURN QUERY
  SELECT
    v_wallet.balance,
    v_wallet.locked_balance,
    (v_wallet.balance - v_wallet.locked_balance) AS available_balance;
END;
$$;

-- Grant EXECUTE on RPCs
GRANT EXECUTE ON FUNCTION public.get_or_create_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_funds(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_funds(numeric, text) TO authenticated;
