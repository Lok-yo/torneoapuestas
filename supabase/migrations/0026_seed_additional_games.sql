-- 0026_seed_additional_games.sql
-- Seeds the 5 additional games displayed in the UI filter bar.
-- 0007 only seeded ssbu; the app's game catalog (src/data/games.js)
-- expects 6 games. Idempotent.

insert into public.games (id, name) values
  ('melee', 'Super Smash Bros. Melee'),
  ('sf6', 'Street Fighter 6'),
  ('fatal-fury', 'Fatal Fury: City of the Wolves'),
  ('tekken8', 'Tekken 8'),
  ('roa2', 'Rivals of Aether II')
on conflict (id) do nothing;

insert into public.tournament_formats (id, game_id, name, participant_mode, bracket_type, roster_size, best_of, ruleset, ruleset_version) values
  ('00000000-0000-0000-0000-000000000002', 'melee', 'Melee Singles — 8-Player Single Elimination', '1v1', 'single_elimination', 8, 3, jsonb_build_object('stocks', 4, 'clockMinutes', 8, 'items', 'off'), 1),
  ('00000000-0000-0000-0000-000000000003', 'sf6', 'SF6 Singles — 8-Player Single Elimination', '1v1', 'single_elimination', 8, 3, jsonb_build_object('rounds', 3), 1),
  ('00000000-0000-0000-0000-000000000004', 'fatal-fury', 'Fatal Fury Singles — 8-Player Single Elimination', '1v1', 'single_elimination', 8, 3, jsonb_build_object('rounds', 3), 1),
  ('00000000-0000-0000-0000-000000000005', 'tekken8', 'Tekken 8 Singles — 8-Player Single Elimination', '1v1', 'single_elimination', 8, 3, jsonb_build_object('rounds', 3), 1),
  ('00000000-0000-0000-0000-000000000006', 'roa2', 'Rivals II Singles — 8-Player Single Elimination', '1v1', 'single_elimination', 8, 3, jsonb_build_object('stocks', 3, 'clockMinutes', 7, 'items', 'off'), 1)
on conflict (id) do nothing;
