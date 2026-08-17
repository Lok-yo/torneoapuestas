-- 0007_ssbu_format_seed.sql
-- Seeds Stage 1's exactly-one approved game/format configuration: Super
-- Smash Bros. Ultimate, 1v1 singles, single-elimination, 8-participant
-- roster, best-of-3 (first to 2). See proposal.md "Resolved Decisions
-- Baked Into This Plan" (launch game/format) and design.md "Generic vs one
-- configuration". Idempotent: safe to replay (on conflict do nothing),
-- consistent with 0002_admin_bootstrap.sql's convention.

insert into public.games (id, name)
values ('ssbu', 'Super Smash Bros. Ultimate')
on conflict (id) do nothing;

insert into public.tournament_formats (
  id, game_id, name, participant_mode, bracket_type, roster_size, best_of, ruleset, ruleset_version
)
values (
  '00000000-0000-0000-0000-000000000001',
  'ssbu',
  'SSBU Singles — 8-Player Single Elimination',
  '1v1',
  'single_elimination',
  8,
  3,
  jsonb_build_object(
    'stocks', 3,
    'clockMinutes', 7,
    'items', 'off',
    'stageSelection', 'striking_counterpick'
  ),
  1
)
on conflict (id) do nothing;
