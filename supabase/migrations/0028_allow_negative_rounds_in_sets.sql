-- Allow negative rounds for start.gg Losers bracket sets
ALTER TABLE public.tournament_sets DROP CONSTRAINT IF EXISTS tournament_sets_round_check;
ALTER TABLE public.tournament_sets ADD CONSTRAINT tournament_sets_round_check CHECK (round != 0);
