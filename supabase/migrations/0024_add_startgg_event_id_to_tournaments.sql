-- Add start.gg event ID column to tournaments so the Create-Market UI
-- can look up tournaments by their start.gg ID and detect duplicates.
ALTER TABLE tournaments ADD COLUMN startgg_event_id bigint;
CREATE INDEX idx_tournaments_startgg_event_id ON tournaments(startgg_event_id) WHERE startgg_event_id IS NOT NULL;
