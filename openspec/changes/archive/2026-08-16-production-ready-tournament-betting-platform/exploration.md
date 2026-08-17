## Exploration: Production-ready tournament betting platform

### Current State

The requested outcome is substantially larger than a frontend conversion. It combines tournament operations, competitive scoring, authenticated user identity, statistical prediction, a regulated-money product, crypto settlement, and production operations. The current repository is a small client-only prototype and has no trustworthy server boundary for any of those responsibilities.

- **Stack and repository shape:** `package.json` contains React `19.2.8`, Vite `8.2.0`, React Router `7.18.2`, Zustand `5.0.14`, Recharts `3.10.1`, Tailwind CSS `4.3.3`, and Oxlint. The app is JavaScript/JSX, not TypeScript. There is no `@supabase/supabase-js`, Supabase CLI project, backend, API layer, `supabase/` directory, server function directory, CI workflow, test file, test runner, type checker, or observability configuration. `openspec/config.yaml` confirms that lint and production build are the only configured quality checks and strict TDD is disabled.
- **Routes and shell:** `src/App.jsx` defines `/`, `/login`, `/onboarding`, `/torneos`, `/torneos/:id`, `/mercados/:id`, `/ranking`, `/jugadores/:username`, protected `/wallet`, and a catch-all. `src/layouts/MainLayout.jsx` provides the shared navbar/content/footer. Only the wallet route is guarded by `src/components/RequireAuth.jsx`; tournament administration, result entry, organizer views, moderation, and compliance views do not exist.
- **Mock/static data:** `src/data/games.js` is a static six-game catalog. `src/data/players.js` generates fictitious players, ratings, records, and recent form from a deterministic RNG seed. `src/data/tournaments.js` creates one fixed tournament per game. `src/data/matches.js` generates brackets, simulates winners, assumes a power-of-two roster, and derives played results from the prediction formula. `src/data/markets.js` creates one binary market per generated match with synthetic volume, price history, and `yesPrice`. These modules are imported directly by pages and components, so they are the current system of record from the UI's perspective.
- **Identity:** `src/store/useSessionStore.js` persists a fabricated user in `localStorage`, exposes `loginWithGoogleMock`, checks usernames against the mock player list, and writes the username locally. It explicitly says that Supabase Auth/Google is future work. There is no server-side identity/profile row, uniqueness transaction, session listener, role model, account recovery policy, or abuse control.
- **Wallet and markets:** `src/store/useWalletStore.js` persists `TCRED` balance, positions, and transactions in `localStorage`. `buyShares` and `closePosition` perform client-side arithmetic against a static price; there is no authenticated command, database transaction, order book/AMM, matching, custody, chain interaction, withdrawal, resolution payout, audit trail, replay protection, or concurrency control. `PositionRow.jsx` disables closing resolved markets, and no settlement path exists. The footer and `WalletPage.jsx` correctly identify TCRED as simulated, not cryptocurrency.
- **Prediction:** `src/lib/prediction.js` is an intentionally transparent Elo-like formula: 70% rating and 30% recent form, clamped to 5–95%. `PredictionWidget.jsx` exposes the factors and a disclaimer. There is no trained model, feature provenance, model version, calibration report, backtest, confidence interval, drift monitoring, or separation between prediction and market price. Because `matches.js` uses the same formula to simulate outcomes and `markets.js` uses it to seed prices, the current demo is circular and cannot establish predictive validity.
- **Reusable UI:** The route/page composition and presentational concepts in `src/components/` are useful: `TournamentCard`, `MatchRow`, `MarketCard`, `PlayerCard`, `LeaderboardTable`, `PredictionWidget`, `MarketProbabilityBar`, `MarketPriceChart`, `GameTabs`, `GameTag`, `StatusBadge`, `TierBadge`, and `Avatar`. Several components are coupled to mock lookup functions, so they are not data-source independent yet. `src/lib/tiers.js` and `src/lib/format.js` may survive behind domain adapters, but their labels, currencies, and rating assumptions must not become the production contract accidentally.
- **Migration posture:** The repository contains only the initial application commit and no evidence of a production data migration. The mock data should not be promoted into production as seed truth. It can remain as explicit demo/test fixtures while persisted data is introduced; any removal should still be preceded by a usage check if the prototype has external consumers.

### Affected Areas

- `src/App.jsx`, `src/main.jsx`, `src/layouts/MainLayout.jsx`, `src/components/RequireAuth.jsx` — preserve the route shell where useful, but add async session/bootstrap states, authorization boundaries, organizer/admin routes, error/loading states, and a server-backed auth contract.
- `src/pages/LoginPage.jsx`, `src/pages/OnboardingUsernamePage.jsx`, `src/store/useSessionStore.js` — replace the mock Google action and local username mutation with Supabase Auth, redirect configuration per environment, auth-state subscription, a `profiles` record, and an atomic case-insensitive username claim.
- `src/data/games.js`, `src/data/players.js`, `src/data/tournaments.js`, `src/data/matches.js`, `src/data/markets.js` — replace runtime-generated mock truth with repositories/queries over migrations; keep deterministic fixtures only in a clearly named demo/test boundary.
- `src/lib/prediction.js`, `src/components/PredictionWidget.jsx` — separate authoritative statistics from derived presentation, introduce versioned prediction outputs and calibration evidence, and defer monetized prediction until sufficient historical data and governance exist.
- `src/store/useWalletStore.js`, `src/components/BuySharesPanel.jsx`, `src/components/PositionRow.jsx`, `src/pages/WalletPage.jsx`, `src/components/Market*` — do not port the localStorage ledger to production. Replace it only after the product is classified legally and custody, market mechanism, resolution, settlement, compliance, and failure recovery are selected.
- `src/data/matches.js`, `src/pages/TournamentDetailPage.jsx`, `src/components/MatchRow.jsx` — move bracket, match lifecycle, scoring, result entry, corrections, appeals, and official-result authority into a tournament domain rather than deriving them in render-time JavaScript.
- `src/lib/tiers.js`, `src/lib/format.js`, `src/components/TierBadge.jsx`, `src/components/LeaderboardTable.jsx`, `src/pages/LeaderboardPage.jsx`, `src/pages/PlayerProfilePage.jsx` — retain the display ideas, but source ratings, records, player identity, and history from authoritative, versioned records.
- `package.json`, `package-lock.json`, `vite.config.js`, `.oxlintrc.json`, `README.md` — add the selected client/server dependencies, environment contract, documentation, type/validation strategy, and security/dependency checks only in later scoped changes. The current README is still the generic Vite template.
- New infrastructure required but absent: `supabase/migrations/`, `supabase/functions/`, environment configuration for development/staging/production, CI/CD, monitoring/error reporting, rate limiting, backup/restore procedures, audit-log storage, and operational runbooks.

### Supabase and Server-Boundary Assessment

Supabase is a credible system of record for the first stages, but it is not a substitute for product/legal decisions or for a transaction service. The following design is a candidate boundary, not yet an implementation specification:

- **Auth and onboarding:** Configure Google in Supabase Auth and the Google OAuth client separately for local, staging, and production redirect URLs. The browser may call `signInWithOAuth({ provider: 'google' })` with the public Supabase key; it must never receive a service-role secret. Subscribe to auth changes and clean up the subscription. After authentication, create or fetch `profiles` keyed by `auth.users.id`; claim a normalized, case-insensitive unique username through a database transaction or server command, not a client-side availability check. Preserve the distinction between an authenticated profile and a competitive `player` record if one user can compete in multiple games.
- **Candidate Postgres boundaries:** `profiles`, `games`, `players`, `player_game_stats`, `tournaments`, `tournament_memberships`, `stages`, `matches`, `match_results`, `rating_events`/snapshots, and `audit_events` belong to the core platform. Later market work would need separate `markets`, `outcomes`, `orders` or AMM positions, `trades`, `ledger_entries`, `settlements`, `oracle_events`, `disputes`, wallet-account references, and compliance cases. Financial records should be append-only or correction-based; balances should be derived or atomically maintained from an auditable ledger, never trusted from a browser store.
- **RLS:** Enable RLS on every exposed table. Public users may read only intentionally published tournament/player/market projections. Authenticated users may read their own private profile and private financial/compliance data. Organizer actions require membership/role checks; official result and settlement actions require explicit server-authorized roles. A policy that merely checks authentication is insufficient. Service-role access belongs only in controlled Edge Functions or another backend boundary, never in Vite client code.
- **Edge Functions/server commands:** Use functions or database RPCs for commands with invariants: username claim, tournament lifecycle transitions, registration close, bracket generation, official result submission/correction, rating updates, market close, deposits/withdrawals/webhooks, settlement, dispute resolution, and administrative actions. Validate external input at the boundary, make commands idempotent, record actor/request IDs, and return one structured error shape. Do not let the client update a match winner, balance, market status, or settlement directly.
- **Realtime:** Realtime is appropriate for live match status, bracket updates, and later market/order/settlement projections, but it is a delivery mechanism, not authority. Persist first, authorize subscriptions, handle reconnects and missed events, and reconcile from the database. It is not required for the first authenticated tournament slice.
- **Migrations and environments:** Use committed SQL migrations and the Supabase CLI for local reset, diff, migration history, and deployment. Use separate Supabase projects for development, staging, and production; do not share data or OAuth redirect URLs. Keep public client configuration separate from server secrets, inject secrets per environment, prohibit dashboard-only schema drift, and test backup restoration/PITR before calling the system production-ready.

### Tournament, Scoring, and Lifecycle Boundaries

The domain should be modeled as commands and state transitions rather than as generated arrays. A candidate lifecycle is `DRAFT -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> IN_PROGRESS -> COMPLETED`, with explicitly modeled `CANCELLED`, `VOID`, and `DISPUTED` paths. The exact states depend on organizer policy, but every transition must be server-validated and audited.

Boundaries:

1. **Tournament organization:** organizer owns configuration, format, game/ruleset, schedule, eligibility, prize description, and state transitions.
2. **Registration/participants:** membership, eligibility, check-in, withdrawal, seeding, and roster freeze are separate from the tournament aggregate.
3. **Stage/bracket:** a tournament can contain stages; bracket generation assigns slots and dependencies but does not invent results.
4. **Match and score:** a match has participants, ruleset, schedule, status, and an official result. Game-specific score schemas should be versioned rather than forcing all games into a generic winner flag.
5. **Rating/scoring:** ratings and leaderboard projections are consequences of accepted results. Corrections append an adjustment/audit event instead of silently rewriting history.
6. **Market/prediction:** predictions and markets consume official match projections; they must not be able to mutate competition truth.

Required invariants include:

- A participant cannot be registered twice; a roster cannot change after the configured freeze point without an audited exception.
- A match belongs to exactly one stage/tournament and references eligible participants; bracket advancement happens once per official result.
- Results are idempotent and uniquely identified; an official result cannot be overwritten without an authorized correction/appeal flow.
- A match cannot be settled before its valid completion state, and a void/cancelled match cannot silently resolve a market.
- Scores, best-of rules, game/patch/ruleset, timestamps, submitting actor, verification status, and correction reason are retained.
- Rating updates occur only from official results, are versioned, and can be recomputed from an event history.
- Organizer, referee, moderator, and finance/resolution permissions are distinct; participant conflict-of-interest rules must be explicit before allowing player betting.
- All commands are transactionally safe under retries and concurrent submissions.

The current `Math.log2`/power-of-two bracket generation in `src/data/matches.js`, random winner simulation, fixed statuses in `src/data/tournaments.js`, and direct lookup imports are demo-only and cannot enforce these invariants.

### Prediction Assessment

The requested predictor should be treated as a decision-support feature with measurable uncertainty, not as a promise of winning bets.

- **Data needed:** canonical match outcomes; game, ruleset, patch, stage, format, and timestamp; player identity and inactivity; rating history; sample size; opponent strength; recent form with a declared window; roster/line-up changes; and, where relevant, maps, characters, sides, or other game-specific context. Every feature needs provenance, missing-data behavior, and leakage review.
- **Current limitation:** ratings and form are generated randomly, recent form is only five synthetic values, and mock outcomes are generated from the same formula that is displayed. This creates circular evidence and invalidates calibration claims.
- **Recommended model path:** start with a transparent, versioned Elo/logistic or Bradley-Terry baseline; use time-ordered backtests, holdout tournaments, Brier score/log loss, reliability diagrams, and calibration before considering a more complex model. Store model version, feature snapshot, probability, uncertainty/confidence, and explanation factors with each prediction.
- **Product safeguards:** show sample size, freshness, missing factors, calibration status, and “not financial advice”/risk language appropriate to the legal review. Keep model probability separate from market price and never let an opaque model be the sole market-resolution authority.
- **Deferment rule:** do not expose monetized prediction claims until there is enough real, consented, representative historical data and an owner for model monitoring. Read-only baseline predictions may follow the tournament/results slice if they are clearly labeled and measurable.
- **Abuse risks:** smurfing/sandbagging, match fixing, collusion, insider knowledge, deliberately manipulated player stats, data leakage, adversarial lineup changes, market manipulation, and users treating an uncalibrated probability as a guarantee. The predictor needs integrity monitoring and a kill switch.

### Crypto Market and Settlement Assessment

The current UI resembles a binary market, but it is not a market infrastructure. Before any real-money implementation, choose one legally reviewed operating model:

| Model | Advantages | Costs and blockers |
|---|---|---|
| Custodial/managed ledger | Simple UX, atomic internal positions, easier recovery and support | Custody/money-transmission/MSB obligations, KYC/AML, segregation, reconciliation, insolvency and key-management risk |
| Non-custodial smart contracts | Users retain wallet control; transparent on-chain rules and settlement | Smart-contract audit, oracle/dispute design, irreversible errors, gas/finality/reorg/MEV, wallet UX, sanctions and gambling exposure still remain |
| Regulated/external venue or provider | Can outsource selected custody, liquidity, KYC, or settlement capabilities | Provider availability and jurisdiction fit are not guaranteed; fees, dependency, data mapping, outage/recovery and product-control limits |

The platform must also decide the launch jurisdiction, asset/stablecoin, chain/network, wallet connection model, custody provider, market mechanism (order book versus AMM), who supplies liquidity, fees/slippage, limits, and whether tournament participants may trade their own matches. Do not build multiple custody or chain paths “for flexibility”; select one reviewed path later.

Every market needs an explicit question, outcome set, close time, eligibility, fee/risk limits, authoritative result source, finality rule, resolver, challenge window, dispute process, void/refund behavior, and settlement formula. Failure cases must be designed before code: stale or conflicting result feeds, match cancellation, result correction after trading, chain reorganization, deposit/withdrawal webhook replay, provider outage, stuck transaction, partial fill, double spend, oracle compromise, insolvency, sanctions hit during payout, and manual-review escalation.

Integrity controls must cover sybil/multi-accounting, wash trading, collusion, insider or participant trading, self-trading, front-running/MEV, abnormal price/volume, automated abuse, rate limits, circuit breakers, immutable audit logs, and a documented recovery/compensation policy. Realtime price display must never be treated as settlement truth.

The recommended first slice excludes real cryptocurrency, deposits, withdrawals, market trading, and settlement. A sandbox balance can exist only as an explicitly non-production fixture if product discovery needs it; it must not share production schemas or imply legal readiness.

### Legal, Regulatory, and Product Blockers

This is not a feature-only decision. “Esports winner markets settled with cryptocurrency” may implicate gambling/prediction-market law, derivatives or event-contract rules, money transmission/MSB rules, crypto-asset service-provider rules, consumer protection, tax, privacy, and esports integrity obligations. A Polymarket-like interface does not determine classification.

The following must be resolved by qualified counsel and a compliance owner before specifications for real-money markets:

- **Jurisdiction and entity:** select the operator entity, launch country/state(s), target and excluded jurisdictions, governing law, licensing route, and whether the product is gambling, an event-contract/derivatives product, a financial/crypto service, or more than one. The current `es-AR` formatting and Spanish UI do not establish an Argentina domicile or legal perimeter.
- **KYC/AML and sanctions:** determine customer due diligence, beneficial-owner/PEP/adverse-media screening, source-of-funds, transaction monitoring, record retention, suspicious-activity reporting, travel-rule/payment obligations, and wallet/address screening. Decide where compliance data lives and who may access it.
- **Age, geolocation, and responsible gambling:** define minimum age, identity/age verification timing, IP/device/location controls, VPN/proxy handling, self-exclusion, cooling-off, deposit/loss/time limits, affordability interventions, marketing restrictions, vulnerable-user support, and complaints/chargeback handling.
- **Privacy and data rights:** document controller/processor roles, lawful basis, consent boundaries, data minimization, retention/deletion exceptions for financial/compliance records, international transfers, user access/export/deletion, profiling/model transparency, and Google data handling. KYC and geolocation data should not be collected merely because the UI may eventually need it.
- **Competition integrity:** establish participant/organizer trading restrictions, suspicious-match reporting, result-source independence, cooperation with tournament operators, and conflict-of-interest/insider rules.
- **Consumer and financial disclosures:** terms, risk warnings, fees, pricing, settlement and void rules, complaints, dispute resolution, tax reporting, custody/segregation disclosures, and incident communications must be product requirements, not copy added after implementation.

Official evidence consulted includes the CFTC's June 12, 2026 proposed rule on prediction-market public-interest determinations (a proposal, not a final classification), FinCEN virtual-currency/MSB guidance, OFAC virtual-currency sanctions guidance, UK Gambling Commission age/identity verification guidance, EU MiCA, and GDPR. These sources demonstrate why the perimeter is jurisdiction-specific; they do not constitute legal advice or authorize this product.

### Production Readiness Gaps

- **Testing:** no test runner or tests are present. The first production slices need unit tests for state machines/ledger math, database/RLS integration tests, contract tests for commands and webhooks, browser/e2e coverage for auth and tournament flows, and adversarial tests for authorization, replay, concurrency, and failure recovery. Lint/build are necessary but not sufficient.
- **Security:** define trust boundaries and threat models for OAuth, profiles, organizer commands, result ingestion, external providers, wallets, webhooks, and admin actions. Validate all external input, use structured errors, enforce authorization in the database/server, protect secrets, add security headers/CSP/CORS policy, rate-limit auth/commands, and audit dependencies before release.
- **Operations:** add CI with reproducible installs, lint/build/tests, migrations and RLS checks, preview/staging deployment, controlled production promotion, feature flags, rollback/runbooks, error tracking, structured logs, metrics/traces, alerting, SLOs, and incident ownership. No `.github/` workflow or observability setup currently exists.
- **Data durability:** define backups, point-in-time recovery, restore drills, migration down/forward strategy, reconciliation jobs, retention, and export. Use additive expand/migrate/contract schema changes; never couple a destructive rename/drop to the first code deploy.
- **Reliability:** commands need idempotency keys, optimistic/concurrency controls, transaction boundaries, retry-safe provider webhooks, dead-letter/manual-review paths, and explicit degraded behavior when Realtime, OAuth, chain RPC, oracle, KYC, or market-liquidity providers fail.

### Approaches

1. **One-shot SPA-to-full-platform conversion** — replace the mocks in place, add Supabase calls to pages/stores, and add crypto market behavior in the same change.
   - Pros: preserves the visible prototype quickly; produces a large demo with fewer planning artifacts.
   - Cons: leaves financial and authorization decisions in client code, couples unrelated domains, makes rollback and review unsafe, and cannot resolve legal/custody/oracle blockers through implementation.
   - Effort: **Very high**, with unacceptable production risk.

2. **Supabase-backed modular monolith with staged capabilities** — use Supabase Postgres/Auth/RLS as the core system of record, Edge Functions/RPCs for invariant-bearing commands, a domain-oriented data/access layer, and the existing UI as a replaceable read model. Deliver tournaments and official results first; add read-only prediction after data quality; isolate any later market/settlement integration behind a dedicated boundary.
   - Pros: fits the current team-sized codebase, preserves useful UI work, keeps one authoritative database, supports incremental migrations and feature flags, and postpones irreversible money movement until decisions are settled.
   - Cons: requires deliberate schema/domain work before visual progress; Supabase plan limits, function/runtime constraints, and later market-provider integration must be evaluated.
   - Effort: **High**, but the lowest-risk credible path.

3. **Protocol-first on-chain market platform** — build audited smart contracts, a wallet-first client, oracle/dispute contracts, indexers, and an off-chain tournament service from the start.
   - Pros: transparent custody/settlement primitives and strong public verifiability if the protocol is correctly designed and adopted.
   - Cons: contract/oracle/security audit burden, irreversible failure modes, liquidity bootstrapping, chain/network decisions, and legal obligations remain unsolved; it is disproportionate for the current prototype.
   - Effort: **Very high**; defer until a legally approved market product and liquidity strategy exist.

### Recommendation

Choose Approach 2 and treat this request as a program of separately specified changes, not one implementation slice. Keep the existing route shell and presentational components where their props can be made source-independent. Replace generated mock truth, localStorage auth, localStorage money state, and render-time bracket simulation with server-backed domain projections incrementally. Apply expand/contract migrations and keep the mock data only as explicit fixtures until no demo consumer depends on it.

Recommended capability sequence:

0. **Product/legal gate (decision work, not code):** choose launch jurisdiction/entity, classify the product, define whether real-money markets are in scope, and record explicit exclusions. Without this gate, real-money specs are blocked.
1. **Platform foundation:** Supabase projects/environments, Google Auth, profile/username onboarding, RLS baseline, migration workflow, error/loading/session bootstrap, validation, secrets, CI quality gates, and minimal observability.
2. **Tournament operations:** start with one game and one format; organizer creates/configures a tournament, opens/closes registration, freezes roster, generates a bracket, records/validates results, and publishes the tournament view. No betting or crypto.
3. **Scoring and ratings:** versioned game-specific scores, official-result corrections/appeals, rating events/snapshots, leaderboard/profile history, and auditability.
4. **Read-only prediction:** baseline model, historical dataset, backtest/calibration metrics, explanation and confidence UI, data freshness/quality gates, and a kill switch. No monetized promises.
5. **Market/compliance design:** independently specify market mechanism, custody, asset/network, liquidity, resolution/oracle/disputes, KYC/AML, sanctions, age/geolocation, responsible-gambling controls, and failure recovery after legal review.
6. **Real-money integration (conditional):** one selected regulated/provider or audited contract path, isolated ledger/settlement service, reconciliation, monitoring, limits, withdrawals, and controlled jurisdiction rollout. This should be a separate high-risk change with extraordinary review.
7. **Realtime and scale hardening:** subscribe to persisted match/market projections, load/performance testing, restore drills, incident simulations, security review, and production rollout gates.

The genuinely minimal first implementation slice is **Google sign-in plus unique username onboarding, one persisted tournament lifecycle for one game/format, organizer result entry, and a public leaderboard**. It should explicitly exclude real cryptocurrency, deposits/withdrawals, market trading/settlement, KYC collection, and ML claims. This produces a useful vertical slice while keeping the legal and financial perimeter closed.

### Risks

- **Critical:** launching or specifying crypto wagering before product classification, licensing, KYC/AML, sanctions, age/geolocation, and responsible-gambling decisions.
- **Critical:** allowing a browser or ordinary RLS client to mutate official results, balances, orders, or settlements.
- **Critical:** loss or duplication of funds through client-side balances, non-idempotent webhooks, replay, concurrency, chain reorgs, oracle failure, or incomplete settlement/rollback paths.
- **High:** corrupting tournament brackets or ratings through mutable results, invalid roster transitions, unsupported formats, or unversioned corrections.
- **High:** presenting the current circular mock predictor as a calibrated model or allowing it to drive money movement.
- **High:** match fixing, participant/organizer conflicts, sybil accounts, wash trading, insider trading, and adversarial manipulation of player statistics.
- **High:** collecting identity, financial, geolocation, or behavioral data before a lawful purpose, retention policy, processor agreement, and access model exist.
- **Medium:** trying to replace all static data and UI at once, creating a large unreviewable change and making migration/rollback unclear.
- **Medium:** relying on Realtime or third-party providers without reconciliation, missed-event recovery, rate limits, timeouts, and degraded-mode behavior.
- **Medium:** treating lint/build as production evidence when there are no unit, integration, browser, migration, RLS, load, or restore tests.

### Ready for Proposal

**No for the full product brief.** The exploration is sufficient to propose a deliberately scoped Stage 1 foundation/tournament change, but real-money markets, crypto settlement, and monetized prediction are blocked by unresolved jurisdiction, legal classification, compliance, custody, market, oracle, liquidity, data, and operational decisions. The next proposal should name the first slice, list the exclusions above, and make the legal/market work a prerequisite rather than hiding it inside implementation tasks.

### Evidence and Sources

- Repository evidence: `package.json`, `openspec/config.yaml`, `src/App.jsx`, `src/layouts/MainLayout.jsx`, `src/store/useSessionStore.js`, `src/store/useWalletStore.js`, `src/lib/prediction.js`, all `src/data/*.js`, all `src/pages/*.jsx`, and all `src/components/*.jsx` listed above.
- Supabase Auth/Google and redirect URLs: <https://supabase.com/docs/guides/auth/social-login/auth-google>, <https://supabase.com/docs/guides/auth/redirect-urls>.
- Supabase RLS, production checks, migrations, Edge Functions/secrets, and Realtime: <https://supabase.com/docs/guides/database/postgres/row-level-security>, <https://supabase.com/docs/guides/deployment/going-into-prod>, <https://supabase.com/docs/guides/deployment/database-migrations>, <https://supabase.com/docs/guides/functions/secrets>, <https://supabase.com/docs/guides/realtime/postgres-changes>.
- CFTC proposed rule, dated June 12, 2026: <https://www.federalregister.gov/documents/2026/06/12/2026-11854/prediction-markets-public-interest-determinations>.
- FinCEN virtual-currency guidance: <https://www.fincen.gov/news/news-releases/fincen-issues-guidance-virtual-currencies-and-regulatory-responsibilities>.
- OFAC Sanctions Compliance Guidance for the Virtual Currency Industry: <https://ofac.treasury.gov/media/913571/download?inline>.
- UK Gambling Commission age and identity verification: <https://www.gamblingcommission.gov.uk/public-and-players/guide/age-and-id-verification>.
- EU MiCA summary: <https://eur-lex.europa.eu/EN/legal-content/summary/european-crypto-assets-regulation-mica.html>.
- GDPR: <https://eur-lex.europa.eu/eli/reg/2016/679/oj>.
