# Legacy module retirement checklist

Per-module gate for deleting anything under `src/data/*`, the mock
`useSessionStore`/`useWalletStore`, and the prediction/market UI. See
`openspec/changes/production-ready-tournament-betting-platform/tasks.md`
5.5 and the legacy-migration-controls spec, requirement "Expand, verify,
and retire safely": **a module is not deleted until this checklist shows
zero production consumers, a verified replacement, and rollback
evidence.**

Do not delete a module just because this document lists it — deletion
still needs a dedicated, verified follow-up change once every row below
reads "0 consumers".

## How to use this checklist

For each module, "Consumers" lists every file that currently imports it.
Before deleting a module:

1. Confirm the "Consumers" column is empty (every listed consumer has been
   migrated to the real repository/adapter or removed).
2. Confirm the replacement path has its own passing unit/pgTAP/Playwright
   coverage (link it in "Replacement verified").
3. Confirm a rollback path exists (e.g., the flag in
   `src/config/featureFlags.js` that gated the consumer can still be
   flipped back without deleting the fixture module itself) — this
   checklist's own point of existing is to avoid an irreversible deletion.
4. Only then does the module qualify for a dedicated removal change.

## `src/data/*` (fixture catalog)

| Module | Consumers today | Replacement | Replacement verified | Status |
|---|---|---|---|---|
| `src/data/games.js` | `GameTabs.jsx`, `HomePage.jsx`, `TournamentsPage.jsx`, `TournamentDetailPage.jsx`, `LeaderboardPage.jsx`, `PlayerProfilePage.jsx`, `MarketDetailPage.jsx`, `MarketCard.jsx`, `PlayerCard.jsx` | None — `GAMES` is display metadata (name/icon/accent color) for the one seeded `games` row (`ssbu`, migration `0007_ssbu_format_seed.sql`), not a data source that competes with Postgres. `getGameById(game_id)` from the real backend rows is exactly how the migrated pages already use it. | N/A — not a truth-source migration | **Keep.** This is UI presentation metadata, not mock competitive data; it is not in scope for retirement. |
| `src/data/tournaments.js` (`TOURNAMENTS`) | none (as of this batch — `HomePage.jsx`'s featured-tournaments section now reads `listTournaments()` from `tournamentRepository.js` instead) | `src/repositories/tournamentRepository.js` (`listTournaments`) | `src/pages/TournamentsPage.jsx`/`TournamentDetailPage.jsx`/`HomePage.jsx` all verified via `e2e/tournament-flow.spec.js` and manual pgTAP-backed repository coverage | **0 consumers as of this batch — candidate for a dedicated removal change**, but not deleted here (still referenced transitively by `src/data/markets.js`/`src/data/matches.js` below). |
| `src/data/players.js` (`PLAYERS`) | `src/store/useSessionStore.js` (`getPlayerByUsername` for the mock login/username-taken check), `src/data/markets.js`, `src/data/matches.js`, `src/components/{MarketCard,PlayerCard,MatchRow}.jsx`, `src/pages/MarketDetailPage.jsx` | `src/repositories/ratingRepository.js` (`getLeaderboard`/`getPlayerRatings`/`getPlayerHistory`) + `src/repositories/profileRepository.js` for identity | `LeaderboardPage.jsx`/`PlayerProfilePage.jsx` verified via `e2e/leaderboard-history.spec.js` + `supabase/tests/rating_projection.sql` | **Blocked** — still consumed by `useSessionStore.js` (mock login) and every legacy market/prediction component. Gated behind `FEATURE_FLAGS.demoFinancialUI` as of this batch (see below), but not yet zero consumers. |
| `src/data/matches.js` | `src/data/markets.js`, `src/components/MatchRow.jsx`, `src/pages/MarketDetailPage.jsx` | `src/repositories/bracketRepository.js` (`getBracket`) | `TournamentDetailPage.jsx` verified via `e2e/tournament-flow.spec.js` | **Blocked** — same market/prediction consumers as `players.js`. `MatchRow.jsx` itself already has 0 consumers (superseded by `TournamentDetailPage.jsx`'s own bracket rendering in batch 3) but is not deleted here per "never delete/migrate legacy modules in one step". |
| `src/data/markets.js` | `src/pages/{HomePage,MarketDetailPage}.jsx`, `src/components/MarketCard.jsx` | None planned — Stage 1 excludes monetized prediction markets entirely (proposal.md "Out of Scope"). This module has no production replacement because it has no production future. | N/A | **Blocked pending a product decision**, not a migration: either (a) this entire prediction-market feature is formally retired from the codebase (not just gated), or (b) a future stage explicitly re-scopes it with the legal/financial gates proposal.md lists as prerequisites. Until that decision, it stays fixture-only and flag-gated. |

## Mock stores

| Module | Consumers today | Replacement | Status |
|---|---|---|---|
| `src/store/useSessionStore.js` | `src/store/useSessionStore.js` (internal helpers) | `src/auth/SessionProvider.jsx` (`useSession()`) | **Migrated & Complete**: `Navbar.jsx` and `HomePage.jsx` were migrated from `useSessionStore` to `useSession()` from `SessionProvider.jsx`. `Navbar.jsx` now renders the authenticated user profile, avatar, role-gated `Panel Organizador` link for organizers/admins, and self-service `Ser Organizador` claim action for authenticated users. `HomePage.jsx` hides the Google login CTA when authenticated. |
| `src/store/useWalletStore.js` | `src/components/{Navbar,BuySharesPanel}.jsx`, `src/pages/WalletPage.jsx` | None planned (Stage 1 excludes wallets/custody/deposits/withdrawals per proposal.md) | **Isolated behind `FEATURE_FLAGS.demoFinancialUI` as of this batch** (task 5.6): `/wallet` resolves to `NotFoundPage` and the navbar's balance link never renders when the flag is off, which it always is in a production build (`resolveDemoFinancialUIFlag` hard-forces it off whenever `import.meta.env.PROD` is true, regardless of any env override). The store itself, and every component that reads it, are unchanged — only their reachability changed. No balances, positions, or transactions this store manages were ever real financial state (`STARTING_BALANCE = 1000` simulated TCRED, `persist`-ed to `localStorage` only). |

## Prediction / market UI

| Module | Status |
|---|---|
| `src/pages/{MarketDetailPage,WalletPage}.jsx` | Routes (`/mercados/:id`, `/wallet`) resolve to `NotFoundPage` outside `FEATURE_FLAGS.demoFinancialUI`. Proven unreachable in a production build by `e2e/no-financial-ui.spec.js`. |
| `src/components/{MarketCard,MarketProbabilityBar,MarketPriceChart,PredictionWidget,BuySharesPanel}.jsx` | Only ever rendered from the now-gated `HomePage.jsx` markets section and `MarketDetailPage.jsx`. Not deleted; unreachable in production per the same flag. |
| `src/lib/prediction.js` | **Audited** (tasks.md 7.3, cross-checking `proposal.md`'s "no monetized-ML claims ship" success criterion): consumed only by `PredictionWidget.jsx`, which is rendered only from `MarketDetailPage.jsx`. That page's route resolves to `NotFoundPage` outside `FEATURE_FLAGS.demoFinancialUI` (`App.jsx`), which is hard-forced off in every production build. `data/markets.js`/`data/matches.js` (imported by `MatchRow.jsx`/`PositionRow.jsx`/`MarketCard.jsx`/`MarketDetailPage.jsx`/`HomePage.jsx`) are the same story — `HomePage.jsx`'s own markets section and its `topMarketsByVolume()` call are both individually gated behind the same flag. No non-gated path reaches any of this. Proven in production by `e2e/no-financial-ui.spec.js`. Still not deleted (per "never delete/migrate legacy modules in one step") — this audit only confirms it is safe to consider for a future dedicated removal change. |

## Resolved in a follow-up batch: 5.2/5.4 (real reversible flags + audit trail)

A later verification pass judged the original 5.2/5.3/5.4 deferral
"acceptable for now" (the outage→truthful-unavailable behavior was
already real, since no fixture fallback ever existed to disable) but
flagged two genuine, still-open spec gaps: (a) the "Emergency
disablement" scenario had no real reversible flag for identity/
tournaments/ratings — they were unconditionally `true` — so an
authorized operator could not actually disable one of those adapters;
(b) the "Migration audit and rollback evidence" requirement was
unimplemented. Both are closed now, without a fixture dual-adapter (there
still isn't one, and there still doesn't need to be one — see below):

- **`identity`/`tournaments`/`ratings` are now real, reversible,
  env-scoped flags** (`resolveAdapterFlag()` in `featureFlags.js`,
  `VITE_FEATURE_IDENTITY`/`VITE_FEATURE_TOURNAMENTS`/
  `VITE_FEATURE_RATINGS`), default-on, disabled only by an explicit
  `'false'` override — honored in every environment including
  production, since production is exactly where an operator needs this
  during an incident. The "safe path" on disable is still the truthful
  `UNAVAILABLE` state, not a fixture: these three adapters still have no
  fixture counterpart to fall back to (unchanged reasoning from the
  original deferral), so "Emergency disablement" now genuinely disables
  the adapter rather than being a documentation-only claim.
- **`src/repositories/adapterAvailability.js`** is the shared
  `assertConfigured()` body every Supabase-backed repository now calls;
  it checks the adapter's flag before the dependency (so a deliberate
  operator disablement and an unplanned outage are told apart in the
  audit trail) and always throws the same truthful `AppError('UNAVAILABLE', ...)`.
- **`0014_migration_audit.sql`** adds the append-only `migration_events`
  table (admin-read-only, no UPDATE/DELETE grant to any client role,
  written only through the `record_migration_event` SECURITY DEFINER
  RPC) plus **`src/repositories/migrationEventRepository.js`**, a
  best-effort fire-and-forget writer. It records `FLAG_CHANGE` when an
  adapter's flag is off and `ADAPTER_ERROR` when Supabase itself is
  unreachable — the two event kinds the deferral review named as the
  minimum needed to close the audit gap. `ROLLBACK`/`RECONCILIATION`
  event types exist in the schema for a future operator-facing surface
  but have no writer yet (nothing in this SPA performs a rollback or
  reconciliation action today).
- Full dual-adapter routing (a real Supabase-vs-`src/data/*` fixture
  switch per flag) remains **not implemented, and is not needed for the
  spec gaps above**: `identity`/`tournaments`/`ratings` still have zero
  fixture counterpart, so there is nothing to route *to* on disable. If a
  future stage adds a genuine fixture/staging adapter for one of these
  domains, that adapter — not this flag mechanism — is the missing piece.

## Known deferred work (resolved)

- The `Navbar.jsx`/`HomePage.jsx` mock-session-store gap: RESOLVED. `Navbar.jsx` and `HomePage.jsx` now read `useSession()` from `SessionProvider.jsx`.
- `src/lib/prediction.js` audit: Completed (task 7.3). Gated behind `FEATURE_FLAGS.demoFinancialUI`.
