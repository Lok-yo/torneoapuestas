# Proposal: Production-ready tournament betting platform — Stage 1

## Intent

Make the client-only prototype a production-ready, non-financial Stage 1 slice: identity, persisted tournaments, results, ratings, and public projections. Keep umbrella slug; close legal/financial perimeter.

## Scope

### In Scope
- Supabase environments/migrations, secrets contract, RLS, CI, structured errors, audit, and observability.
- Google OAuth/session bootstrap, profiles, and an atomic case-insensitive username claim.
- One game/format: persisted lifecycle, registration/roster freeze, bracket, organizer-authorized result, and public projections.
- Versioned scoring/rating events, leaderboard, and player history.
- Incremental repositories/adapters replacing mock truth; fixtures remain until consumers migrate.

### Out of Scope
- Real cryptocurrency, wallets, deposits/withdrawals, trading, prices, settlement, custody, liquidity, or smart contracts.
- No KYC collection/legal-approval claim; no monetized prediction/ML claims; circular predictor is not evidence.
- Multi-game/format generalization beyond anti-dead-end boundaries; unrelated visual redesign.
- Real-money markets require jurisdiction/legal classification, licensing, KYC/AML, sanctions, age/geolocation, responsible gambling, custody, oracle, disputes, liquidity, and settlement decisions.

## Capabilities

### New Capabilities
- `platform-foundation`: Supabase/migrations, RLS, validation, CI, secrets, errors, audit, observability.
- `authenticated-identity`: Google sign-in, session, profiles, unique username.
- `tournament-operations`: One game/format, lifecycle, freeze, bracket, results, projections.
- `rating-projections`: Official-result scoring events, versioned ratings, leaderboard, history.
- `legacy-migration-controls`: Staged feature-flagged/adaptor retirement of mock/localStorage.

### Modified Capabilities
- None; `openspec/specs/` has no existing capabilities.

## Approach

Use Supabase Postgres/Auth/RLS as system of record; Edge Functions/RPCs own idempotent commands (username, lifecycle, bracket, result, rating). Stage retirement of `src/data/{games,players,tournaments,matches,markets}.js`, `src/store/useSessionStore.js`, `src/store/useWalletStore.js`, and prediction/market modules; never delete them in one step.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/`, `.github/`, manifests, env/docs | New/Modified | Migrations, CI. |
| `src/App.jsx`, `src/main.jsx`, layouts, auth/session, tournament/leaderboard pages | Modified | Async states, repositories, auth. |
| `src/data/*`, wallet/market/prediction modules | Staged retirement | Fixtures remain until verified. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS/role/retry/lifecycle defects or prototype sources corrupt truth/evidence | High | Database authorization, transactions, idempotency, adversarial tests, fixture boundary, flags. |

## Rollback Plan

Disable flags/commands, serve retained fixtures, revert adapters, and restore/reapply additive migrations or backups. Preserve audit and legacy modules; remove after zero consumers and a verified replacement.

## Dependencies

- Separate Supabase projects/CLI, Google OAuth redirects, secret storage, and CI/runtime access; qualified legal/product gate before real-money specifications.

## Success Criteria

Verified end-to-end against the implemented flows in `tasks.md` (task
7.3); see that file's Apply Progress Log "Batch 5" entry for the full
verification trail and evidence.

- [x] Migrations replay in each environment; CI runs lint/build, migration/RLS, authorization, username-race, lifecycle, result-idempotency, and rating tests. — Migrations `0000`-`0014` replay cleanly (verified repeatedly against a real `supabase/postgres:15.8.1.049` container across every batch, most recently this one). `.github/workflows/ci.yml` runs all of it as one strict sequential gate (install → lint → unit+coverage → Supabase migrations/RLS/pgTAP → build → Playwright → `npm audit`, finalized in task 7.1). pgTAP coverage: RLS deny-by-default + public projection (`rls_deny_by_default.sql`, `public_projection.sql`), authorization/unauthorized-denial (`admin_bootstrap.sql`, `lifecycle_rpc.sql`, `result_submission.sql`, `bracket_concurrency.sql`), username-race (`username_claim_race.sql`), lifecycle (`lifecycle_rpc.sql`), result-idempotency (`result_submission.sql`), rating (`rating_projection.sql`), plus the newer migration-audit trail (`migration_audit.sql`) — 99 assertions across 10 suites, zero regressions in this batch's replay. Verified in a local Docker-based environment equivalent to CI's; not literally re-run against a deployed staging/production Supabase project from this sandbox (no such environment is provisioned here).
- [x] A user can Google sign in, atomically claim a case-insensitive username, register, pass roster freeze, and see tournament, leaderboard, and history after an authorized result. **Phase 8 completed**: Tournament creation from zero is implemented via `create_tournament` RPC (`0015_create_tournament_rpc.sql`), `tournamentRepository.js` (`createTournament`, `claimOrganizerRole`), `OrganizerPanelPage.jsx` UI, pgTAP tests (`create_tournament.sql`), and Playwright E2E coverage (`e2e/tournament-flow.spec.js`). The full chain from zero database state to official results and leaderboard projections is now fully verified end-to-end.
- [x] No client secrets or excluded crypto, KYC, legal-approval, or monetized-ML claims ship; protected commands emit errors, audit, and logs. **Partial on "alerts"** — see caveat below. — No service-role key or other server secret appears anywhere under `src/` (grep-verified: no `SERVICE_ROLE`/`service_role` reference in client code). No wallet/market/prediction UI is reachable in a production build (`e2e/no-financial-ui.spec.js`); this pass additionally audited `src/lib/prediction.js`'s remaining consumers (previously an open item in `docs/legacy-retirement.md`) and confirmed every one of them is contained behind the same production-forced-off flag. `profiles` collects only username/display name/avatar — no KYC/geolocation/behavioral fields. Structured errors (`src/lib/errors.js` / `supabase/functions/_shared/errors.ts`), append-only `audit_events` (every RPC) and `migration_events` (adapter flag/outage events, task 5.4), and correlated structured logs (`supabase/functions/_shared/log.js`) are all real and wired. **Caveat found during this verification pass, not previously flagged**: "alerts" specifically is not implemented — structured logs exist but nothing consumes them to page/notify an operator (grep-verified: no Sentry/PagerDuty/webhook/alerting integration anywhere in `src/` or `supabase/functions/`). This tracks with design.md's still-open "which deployment host owns headers, flags, secrets, previews, promotion, and rollback" question — alerting is an ops-platform decision that hasn't been made yet, not a code gap in this change. Logs/audit are the substrate an alerting layer would consume once a host/platform is chosen.
