-- Migration 0018: Automatic Market Resolution on Tournament Completion
-- Automatically resolves open prediction markets linked to a tournament when the tournament status changes to COMPLETED.

CREATE OR REPLACE FUNCTION public.trigger_auto_resolve_prediction_markets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_market RECORD;
  v_winning_outcome_id uuid;
  v_winner_username text;
BEGIN
  -- When a tournament is marked COMPLETED
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Find winner username from the final match in the tournament bracket
    SELECT p.username INTO v_winner_username
    FROM public.matches m
    JOIN public.results r ON r.match_id = m.id
    JOIN public.memberships mem ON mem.id = r.winner_membership_id
    JOIN public.profiles p ON p.user_id = mem.user_id
    WHERE m.tournament_id = NEW.id AND m.next_match_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1;

    FOR v_market IN
      SELECT id FROM public.markets WHERE tournament_id = NEW.id AND status = 'OPEN'
    LOOP
      -- Try to find outcome matching winner's username or 'Sí'
      SELECT id INTO v_winning_outcome_id
      FROM public.market_outcomes
      WHERE market_id = v_market.id
        AND (
          (v_winner_username IS NOT NULL AND lower(label) = lower(v_winner_username))
          OR lower(label) IN ('sí', 'si', 'yes')
        )
      ORDER BY (CASE WHEN lower(label) IN ('sí', 'si', 'yes') THEN 1 ELSE 2 END)
      LIMIT 1;

      -- Fallback to first outcome if no exact match found
      IF v_winning_outcome_id IS NULL THEN
        SELECT id INTO v_winning_outcome_id FROM public.market_outcomes WHERE market_id = v_market.id LIMIT 1;
      END IF;

      IF v_winning_outcome_id IS NOT NULL THEN
        PERFORM public.resolve_market(v_market.id, v_winning_outcome_id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tournament_completed_auto_resolve_markets ON public.tournaments;
CREATE TRIGGER on_tournament_completed_auto_resolve_markets
  AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_resolve_prediction_markets();
