# Design: Production-ready tournament betting platform — Stage 1

## Technical Approach

Keep the React/Vite shell; put Supabase Auth/Postgres behind repositories and server commands. RLS views are read models; production never falls back to fixtures. Stage 1 includes identity, one game/format, tournaments, official results, ratings, leaderboard, and history—not crypto, wallets, custody, markets, KYC collection, monetization, or win predictions.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| Browser writes vs commands | Writes cannot protect invariants | Edge Functions call transactional RPCs that reject `anon`, lock `search_path`, and authorize `auth.uid()` from database grants—not client/JWT role claims. |
| Mutable state vs events | Events need projections | Append result/correction/rating/grant/audit events and **non-financial command outcomes** solely for idempotency; derive views. |
| Big-bang vs adapters | Temporary indirection | Environment-selected Supabase/fixture adapters permit consumer rollback; production has no fixture fallback. |
| Generic vs one configuration | Genericity delays safety | Seed one approved, versioned game/ruleset/format policy. |

## Sequence Diagrams

```text
Browser->SupabaseAuth: Google OAuth
SupabaseAuth-->SessionProvider: session|failure
SessionProvider->bootstrap-session: JWT
bootstrap-session->Postgres: idempotent profile upsert
Browser->claim-username: requestId+username
claim-username->Postgres: throttle+normalize+atomic uniqueness
Postgres-->Browser: profile|409 collision|429 throttled
```

Provider limits plus persisted username-attempt limits return 429 after the configured threshold; security events/metrics omit tokens and usernames.

```text
Organizer/Referee->result-command: requestId+expectedVersion+evidence
result-command->result-RPC: validate role/state/score/ruleset
result-RPC->Postgres: atomic result+advance+audit+outcome
Postgres->rating-projector: official-result event/version
rating-projector->Postgres: atomic events+snapshots+public views
Postgres-->Browser: original retry outcome; no duplicate advance
```

Conflicting source versions halt ratings, append review state, and preserve evidence/current projections. Authorized corrections append versions and replay deterministically.

## Interfaces / Contracts

- Commands use `{ requestId, aggregateId, expectedVersion, payload }`; errors use `{ error: { code, message, requestId, retryable, details? } }` with stable 400/401/403/404/409/422/429/503 semantics.
- Roles `user`, `organizer`, `referee`, `admin` exist only in database grants; `user` is default.
- Policy enforces `DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → IN_PROGRESS → COMPLETED` plus cancellation, versioned eligibility, unique membership, permitted pre-freeze withdrawal, and frozen rosters.
- Brackets use stable seeding in one transaction, create a complete graph without winners/results, and replay the prior non-financial command outcome.
- Public views allowlist competitive fields; profiles, unpublished memberships, grants, outcomes, and audits are RLS-protected. Audits deny update/delete.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/config.toml`, `supabase/migrations/*.sql`, `supabase/seed.sql` | Create | Schema, events/outcomes, grants, RLS/views/RPCs. |
| `supabase/functions/{bootstrap-session,claim-username,tournament-command,result-command}/index.ts` | Create | Validated authenticated boundaries and throttling. |
| `src/lib/supabase.js`, `src/auth/SessionProvider.jsx`, `src/repositories/*.js`, `src/domain/tournaments/*.js` | Create | Client, adapters, domain logic. |
| `src/App.jsx`, `src/main.jsx`, `src/components/RequireAuth.jsx`, `src/pages/{LoginPage,OnboardingUsernamePage,TournamentsPage,TournamentDetailPage,LeaderboardPage,PlayerProfilePage}.jsx` | Modify | Async/role gates, repositories, truthful states. |
| `src/data/*.js`, `src/store/{useSessionStore,useWalletStore}.js`, `src/lib/prediction.js`, market/wallet UI | Retain/isolate | Fixtures only; retire after zero production consumers. |
| `package.json`, lockfile, `.env.example`, `.github/workflows/ci.yml`, `README.md` | Modify/Create | Tooling, environment, CI/operations. |

## Testing Strategy

First add Vitest, React Testing Library, Playwright, Supabase CLI, and pgTAP/integration scripts; behavior then starts RED. Unit RED: lifecycle, eligibility, withdrawal/freeze, deterministic result-free brackets, rating replay/correction/conflict, errors, adapters. Postgres RED: migrations/down paths, all RLS roles/escalation, username races/throttle threshold, membership uniqueness, bracket concurrency/no partial graph, result retry/advance, source-version review, immutable audit, rollback. Playwright: OAuth-stub bootstrap, collision/throttle, protected/role routes, registration-to-leaderboard/history, outages, absent financial UI. CI gates frozen install, lint, coverage, Supabase integration, build, Playwright, audit.

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and planned RED tests |
|---|---|---|
| Application routes/session redirects | Applicable | Bootstrap blocks rendering; anonymous→`/login`, incomplete→`/onboarding`, forbidden→denial. Allowlisted same-origin returns prevent loops/open redirects. RED: refresh/expiry, direct URL, forged role, hostile return. |
| Documentation-like paths | N/A | No executable-file classification. |
| Git repository selection | N/A | No Git routing. |
| Commit state | N/A | No commit automation. |
| Push state | N/A | No push automation. |
| PR commands | N/A | No PR/process composition. |

Applicable routing cases must propagate unchanged into tasks and RED tests.

## Security, Observability, and Rollout

Separate environment projects, OAuth redirects, secrets, flags, and credentials; validate startup and apply host security headers. Emit correlated logs, bounded RED metrics/traces, actionable auth/throttle/conflict/outage alerts, and no tokens/PII. Enable backups/PITR and restore drills. Apply additive migrations; stage disabled adapters, then enable individually. Roll back flags/client; never use fixture fallback. Use tested rollback SQL only before writes; otherwise forward-fix or restore separately, preserving audit.

## Open Questions

- [x] **Blocking:** Which launch game, ruleset, score schema, roster size, and bracket format are approved? — Resolved during Phase 3 (see `tasks.md` "Resolved Decisions Baked Into This Plan" and task 3.1): `ssbu`, 1v1 singles, single-elimination, 8-participant roster, best-of-3, seeded via `0007_ssbu_format_seed.sql`. Left unchecked here until this Phase-7 verification pass even though implemented since Phase 3 — a documentation gap, not an implementation gap.
- [x] **Blocking:** How is the first organizer/admin grant established and independently approved? — Resolved during Phase 1 (see `tasks.md` "Resolved Decisions Baked Into This Plan" and task 1.2): one-time, idempotent SQL migration (`0002_admin_bootstrap.sql`) applied by the maintainer with the service-role key, granting `admin` to the fixed email `lleonalmaza@gmail.com`; no runtime endpoint or JWT-claim path. Documented for operators in `README.md` "Admin bootstrap procedure".
- [ ] Which deployment host owns headers, flags, secrets, previews, promotion, and rollback? — Still genuinely open: a hosting-platform decision outside this change's code scope (Stage 1 ships the application and its CI gates; host selection/ops ownership is a separate, non-blocking operational decision for the maintainer).
