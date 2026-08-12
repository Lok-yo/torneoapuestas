-- Migration 0017: Polymarket-style Prediction Market Engine
-- Creates public.markets, public.market_outcomes, public.market_positions, RLS policies, and RPCs for buying shares and resolving markets.

-- 1. Create public.markets
CREATE TABLE IF NOT EXISTS public.markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  question text NOT NULL,
  category text NOT NULL DEFAULT 'TOURNAMENT' CHECK (category IN ('TOURNAMENT', 'MATCH', 'PLAYER', 'SPECIAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUSPENDED', 'RESOLVED', 'CANCELLED')),
  resolution_outcome_id uuid,
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY markets_select_all ON public.markets
  FOR SELECT TO authenticated, anon
  USING (true);

-- 2. Create public.market_outcomes
CREATE TABLE IF NOT EXISTS public.market_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label text NOT NULL,
  price numeric(5, 4) NOT NULL DEFAULT 0.5000 CHECK (price > 0 AND price < 1),
  total_shares numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_shares >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_outcomes_select_all ON public.market_outcomes
  FOR SELECT TO authenticated, anon
  USING (true);

-- Foreign key for resolution_outcome_id
ALTER TABLE public.markets
  ADD CONSTRAINT fk_markets_resolution_outcome
  FOREIGN KEY (resolution_outcome_id) REFERENCES public.market_outcomes(id) ON DELETE SET NULL;

-- 3. Create public.market_positions
CREATE TABLE IF NOT EXISTS public.market_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES public.market_outcomes(id) ON DELETE CASCADE,
  shares numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (shares >= 0),
  avg_price numeric(5, 4) NOT NULL DEFAULT 0.5000 CHECK (avg_price > 0 AND avg_price < 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, outcome_id)
);

ALTER TABLE public.market_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_positions_select_own ON public.market_positions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Grants
GRANT SELECT ON public.markets TO authenticated, anon;
GRANT SELECT ON public.market_outcomes TO authenticated, anon;
GRANT SELECT ON public.market_positions TO authenticated;

-- 4. RPC: create_prediction_market
CREATE OR REPLACE FUNCTION public.create_prediction_market(
  p_tournament_id uuid,
  p_question text,
  p_category text DEFAULT 'TOURNAMENT'
)
RETURNS TABLE (
  market_id uuid,
  question text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_market_id uuid;
  v_yes_outcome_id uuid;
  v_no_outcome_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to create market'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role('organizer'::public.app_role) OR public.has_role('admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only organizers or admins can create prediction markets'
      USING ERRCODE = '42501';
  END IF;

  IF p_question IS NULL OR trim(p_question) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Question cannot be empty'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.markets (tournament_id, question, category, status, created_by)
  VALUES (p_tournament_id, trim(p_question), COALESCE(p_category, 'TOURNAMENT'), 'OPEN', v_user_id)
  RETURNING id INTO v_new_market_id;

  -- Create binary outcomes (SÍ / NO) at starting probability 0.50 (50%)
  INSERT INTO public.market_outcomes (market_id, label, price)
  VALUES (v_new_market_id, 'Sí', 0.5000)
  RETURNING id INTO v_yes_outcome_id;

  INSERT INTO public.market_outcomes (market_id, label, price)
  VALUES (v_new_market_id, 'No', 0.5000)
  RETURNING id INTO v_no_outcome_id;

  RETURN QUERY
  SELECT m.id, m.question, m.status FROM public.markets m WHERE m.id = v_new_market_id;
END;
$$;

-- 5. RPC: buy_market_shares
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

  -- Upsert user position
  INSERT INTO public.market_positions (user_id, market_id, outcome_id, shares, avg_price)
  VALUES (v_user_id, p_market_id, p_outcome_id, p_shares, v_outcome.price)
  ON CONFLICT (user_id, outcome_id) DO UPDATE
  SET shares = public.market_positions.shares + EXCLUDED.shares,
      updated_at = now()
  RETURNING id, shares INTO v_position_id, v_existing_shares;

  -- Update outcome total_shares
  UPDATE public.market_outcomes
  SET total_shares = public.market_outcomes.total_shares + p_shares
  WHERE id = p_outcome_id;

  -- Simple CPMM-style price adjustment for binary outcomes
  SELECT * INTO v_other_outcome FROM public.market_outcomes WHERE market_id = p_market_id AND id != p_outcome_id LIMIT 1;
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

-- 6. RPC: resolve_market
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
  v_outcome public.market_outcomes%ROWTYPE;
  v_pos RECORD;
  v_payout_amount numeric(12, 2);
  v_sum_payout numeric(12, 2) := 0.00;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to resolve market'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role('organizer'::public.app_role) OR public.has_role('admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only organizers or admins can resolve prediction markets'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Market does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_market.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Market has already been resolved' USING ERRCODE = '22003';
  END IF;

  SELECT * INTO v_outcome FROM public.market_outcomes WHERE id = p_winning_outcome_id AND public.market_outcomes.market_id = p_market_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Winning outcome does not belong to this market' USING ERRCODE = 'P0002';
  END IF;

  -- Update market state to RESOLVED
  UPDATE public.markets
  SET status = 'RESOLVED',
      resolution_outcome_id = p_winning_outcome_id,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_market_id;

  -- Pay out winning positions: $1.00 per share
  FOR v_pos IN
    SELECT mp.user_id, mp.shares
    FROM public.market_positions mp
    WHERE mp.outcome_id = p_winning_outcome_id AND mp.shares > 0
  LOOP
    v_payout_amount := round(v_pos.shares * 1.00, 2);
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

-- Grant EXECUTE on RPCs
GRANT EXECUTE ON FUNCTION public.create_prediction_market(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_market_shares(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_market(uuid, uuid) TO authenticated;
