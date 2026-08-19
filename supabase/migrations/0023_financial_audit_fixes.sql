-- 0023_financial_audit_fixes.sql
-- Financial audit fixes:
--
-- 1. Drop deposit_funds RPC — auto-deposit without a payment gateway is a
--    critical accounting hole. Deposits must flow through a verified payment
--    gateway callback, not a client-callable RPC.
--
-- 2. Add liquidity_pool column to markets — tracks total funds collected from
--    buy_market_shares so resolve_market payouts are capped at actual revenue.
--
-- 3. Harden resolve_market — payouts are now capped at the market's
--    liquidity_pool. Excess is retained (house edge / organizer treasury).

-- =====================================================================
-- 1. Drop deposit_funds (auto-deposit without payment gateway)
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.deposit_funds(numeric, text) FROM authenticated;
DROP FUNCTION IF EXISTS public.deposit_funds(numeric, text);

-- =====================================================================
-- 2. Add liquidity_pool to markets
-- =====================================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS liquidity_pool numeric(12, 2) NOT NULL DEFAULT 0.00
  CHECK (liquidity_pool >= 0);

COMMENT ON COLUMN public.markets.liquidity_pool IS
  'Total funds collected from bet placements. resolve_market payouts are capped at this value.';

-- =====================================================================
-- 3. Harden resolve_market — cap payouts at liquidity pool
-- =====================================================================

CREATE OR REPLACE FUNCTION public.resolve_market(
  p_market_id uuid,
  p_winning_outcome_id uuid
)
RETURNS TABLE (
  market_id uuid,
  status text,
  winning_outcome_id uuid,
  total_payout numeric(12, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_market public.markets%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_outcome public.market_outcomes%ROWTYPE;
  v_pos RECORD;
  v_payout_amount numeric(12, 2);
  v_sum_payout numeric(12, 2) := 0.00;
  v_pool numeric(12, 2);
  v_is_admin boolean := public.has_role('admin'::public.app_role);
  v_is_owner boolean := false;
  v_total_winner_shares numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to resolve market'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Market does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_market.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Market has already been resolved' USING ERRCODE = '22003';
  END IF;

  -- Validate ownership: admin, market creator, or tournament organizer
  IF v_is_admin THEN
    v_is_owner := true;
  ELSIF v_market.created_by IS NOT NULL AND v_market.created_by = v_user_id THEN
    v_is_owner := true;
  ELSIF v_market.tournament_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_market.tournament_id;
    IF FOUND AND v_tournament.organizer_id = v_user_id THEN
      v_is_owner := true;
    END IF;
  END IF;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the tournament organizer or an admin can resolve this market'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_outcome FROM public.market_outcomes WHERE id = p_winning_outcome_id AND public.market_outcomes.market_id = p_market_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Winning outcome does not belong to this market' USING ERRCODE = 'P0002';
  END IF;

  -- Liquidity pool validation: payouts cannot exceed collected funds
  v_pool := v_market.liquidity_pool;
  IF v_pool <= 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_LIQUIDITY: No funds collected in this market — nothing to pay out'
      USING ERRCODE = '22003';
  END IF;

  -- Calculate total winning shares for proportional cap
  SELECT COALESCE(SUM(mp.shares), 0) INTO v_total_winner_shares
  FROM public.market_positions mp
  WHERE mp.outcome_id = p_winning_outcome_id AND mp.shares > 0;

  IF v_total_winner_shares <= 0 THEN
    RAISE EXCEPTION 'NO_WINNERS: No winning positions to pay out'
      USING ERRCODE = '22003';
  END IF;

  -- Update market state to RESOLVED
  UPDATE public.markets
  SET status = 'RESOLVED',
      resolution_outcome_id = p_winning_outcome_id,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_market_id;

  -- Pay out winning positions: $1.00 per share, capped at liquidity pool
  FOR v_pos IN
    SELECT mp.user_id, mp.shares
    FROM public.market_positions mp
    WHERE mp.outcome_id = p_winning_outcome_id AND mp.shares > 0
  LOOP
    -- Raw payout at $1/share
    v_payout_amount := round(v_pos.shares * 1.00, 2);

    -- If total raw payout would exceed pool, scale proportionally
    IF (v_sum_payout + v_payout_amount) > v_pool THEN
      v_payout_amount := round(v_pool - v_sum_payout, 2);
      IF v_payout_amount <= 0 THEN
        EXIT;
      END IF;
    END IF;

    v_sum_payout := v_sum_payout + v_payout_amount;

    -- Credit winning user's wallet
    UPDATE public.wallets
    SET balance = public.wallets.balance + v_payout_amount,
        updated_at = now()
    WHERE user_id = v_pos.user_id;

    -- Record transaction
    INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference_id, description)
    VALUES (
      v_pos.user_id,
      v_payout_amount,
      'BET_PAYOUT',
      'COMPLETED',
      p_market_id::text,
      'Ganancia acreditada por victoria (' || v_outcome.label || ') en: ' || v_market.question
    );
  END LOOP;

  RETURN QUERY
  SELECT m.id, m.status, m.resolution_outcome_id, v_sum_payout FROM public.markets m WHERE m.id = p_market_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_market(uuid, uuid) TO authenticated;

-- =====================================================================
-- 4. Harden buy_market_shares — track liquidity pool
-- =====================================================================

CREATE OR REPLACE FUNCTION public.buy_market_shares(
  p_market_id uuid,
  p_outcome_id uuid,
  p_shares numeric(12, 2)
)
RETURNS TABLE (
  position_id uuid,
  total_shares numeric(12, 2),
  total_cost numeric(12, 2),
  new_available_balance numeric(12, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_market public.markets%ROWTYPE;
  v_outcome public.market_outcomes%ROWTYPE;
  v_other_outcome public.market_outcomes%ROWTYPE;
  v_total_cost numeric(12, 2);
  v_wallet public.wallets%ROWTYPE;
  v_position_id uuid;
  v_existing_shares numeric(12, 2) := 0;
  v_new_price numeric(5, 4);
  v_other_price numeric(5, 4);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to buy shares'
      USING ERRCODE = '42501';
  END IF;

  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Shares count must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Market does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_market.status != 'OPEN' THEN
    RAISE EXCEPTION 'INVALID_STATE: Market is not open for trading' USING ERRCODE = '22003';
  END IF;

  SELECT * INTO v_outcome FROM public.market_outcomes WHERE id = p_outcome_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Outcome does not belong to this market' USING ERRCODE = 'P0002';
  END IF;

  -- Calculate cost: shares * current outcome price
  v_total_cost := round(p_shares * v_outcome.price, 2);
  IF v_total_cost < 0.01 THEN
    v_total_cost := 0.01;
  END IF;

  -- Ensure user has wallet and sufficient available balance
  PERFORM public.get_or_create_wallet();
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;

  IF (v_wallet.balance - v_wallet.locked_balance) < v_total_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente para realizar la compra' USING ERRCODE = '22003';
  END IF;

  -- Debit wallet and log transaction
  UPDATE public.wallets
  SET balance = public.wallets.balance - v_total_cost,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference_id, description)
  VALUES (
    v_user_id,
    -v_total_cost,
    'BET_PLACED',
    'COMPLETED',
    p_market_id::text,
    'Compra de ' || p_shares || ' acciones (' || v_outcome.label || ') en: ' || v_market.question
  );

  -- Upsert user position with weighted average price recalculation
  INSERT INTO public.market_positions (user_id, market_id, outcome_id, shares, avg_price)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_shares, v_outcome.price)
  ON CONFLICT (user_id, outcome_id) DO UPDATE
  SET avg_price = round(
        ((public.market_positions.shares * public.market_positions.avg_price) + (EXCLUDED.shares * EXCLUDED.avg_price))
        / (public.market_positions.shares + EXCLUDED.shares),
        4
      ),
      shares = public.market_positions.shares + EXCLUDED.shares,
      updated_at = now()
  RETURNING id, shares INTO v_position_id, v_existing_shares;

  -- Update outcome total_shares
  UPDATE public.market_outcomes
  SET total_shares = public.market_outcomes.total_shares + p_shares
  WHERE id = p_outcome_id;

  -- Track liquidity pool: collect the cost of this bet
  UPDATE public.markets
  SET liquidity_pool = public.markets.liquidity_pool + v_total_cost,
      updated_at = now()
  WHERE id = p_market_id;

  -- Simple CPMM-style price adjustment for binary outcomes
  SELECT * INTO v_other_outcome FROM public.market_outcomes WHERE market_id = p_market_id AND id != p_outcome_id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    v_new_price := round(least(0.9500, greatest(0.0500, v_outcome.price + (p_shares * 0.0050))), 4);
    v_other_price := 1.0000 - v_new_price;

    UPDATE public.market_outcomes SET price = v_new_price WHERE id = p_outcome_id;
    UPDATE public.market_outcomes SET price = v_other_price WHERE id = v_other_outcome.id;
  END IF;

  RETURN QUERY
  SELECT
    v_position_id,
    v_existing_shares,
    v_total_cost,
    (v_wallet.balance - v_total_cost - v_wallet.locked_balance) AS new_available_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_market_shares(uuid, uuid, numeric) TO authenticated;
