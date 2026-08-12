```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6af0dc29f95c4307b2555d0b27ae87733f288d19e453fe01b83b2ec36afd9f5b
verdict: fail
blockers: 1
critical_findings: 1
requirements: 23/24
scenarios: 45/47
test_command: npx vitest run
test_exit_code: 0
test_output_hash: sha256:12b26b412b3a588d189812e9ba64b1f40ff8838863bd31cb99868217e3bfceaa
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:a688590269b759eae91e4f6978a507c11d152dbad5cc0d20ee91bbcbbd0cdde5
```

## Verification Report

**Change**: production-ready-tournament-betting-platform
**Version**: N/A (single-shot OpenSpec change)
**Mode**: Standard (full artifact set: proposal, 5 specs, design, tasks)
**Repo HEAD**: e0c6be468f11d3fc956d55fe514a9a7fef80c29d (uncommitted working tree changes present, matches Apply Progress Log)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 67 |
| Tasks complete | 66 |
| Tasks incomplete | 1 (0.3 — `.env.example`; content externally verified by maintainer outside sandbox `.env*` deny-list per orchestrator note; not treated as a defect, per instruction) |

### Build & Tests Execution — independently re-run in this session, not copied from tasks.md

**Build**: PASSED
```
$ VITE_SUPABASE_URL=https://e2e-stub.supabase.co VITE_SUPABASE_ANON_KEY=e2e-stub-anon-key npm run build
✓ 2474 modules transformed, built in 434ms, exit 0
```

**Unit tests (Vitest)**: PASSED — 80/80
```
$ npx vitest run
Test Files  11 passed (11)
     Tests  80 passed (80)
exit 0
```
Matches tasks.md's claimed 80/80.

**Lint (oxlint)**: PASSED (clean, 2 pre-existing fast-refresh warnings only, no errors)

**Postgres / pgTAP** (`supabase/postgres:15.8.1.049` Docker container, fresh, sequential `psql -f` replay of `supabase/migrations/0000`–`0014` in filename order, then all 10 files in `supabase/tests/`):
- Migration replay: 15/15 files applied cleanly, exit 0 each, no errors.
- pgTAP: **99/99 assertions passed, 0 failed**, across all 10 suites:
  `admin_bootstrap` 4/4, `bracket_concurrency` 11/11, `lifecycle_rpc` 8/8, `migration_audit` 12/12, `public_projection` 7/7, `rating_projection` 16/16, `result_submission` 9/9, `rls_deny_by_default` 8/8, `roster_concurrency` 13/13, `username_claim_race` 11/11.
Matches tasks.md's claimed 99/99. Container removed after (`docker rm -f`), no residual state.

**Playwright e2e** (real `npm run build` with stub, non-secret `VITE_SUPABASE_*` env vars, no demo-flag override, `npm run preview`, then `npx playwright test`): **24/24 passed**, matching tasks.md's claimed 24/24. Covers `auth-onboarding` (5), `leaderboard-history` (3), `no-financial-ui` (4), `session-routing` (10), `tournament-flow` (2).

**Coverage**: not separately measured (`--coverage` not run this pass); not available as a percentage threshold gate in this project.

All four layers' pass/fail counts independently reproduce tasks.md's self-reported evidence exactly. No regressions, no flaky/skipped tests observed in three consecutive runs of each layer.

### Spec Compliance Matrix (by requirement; scenario counts from the retrieved spec files)

24 requirements / 47 scenarios counted directly from the 5 spec files (`platform-foundation` 5 req/10 scn, `authenticated-identity` 5 req/9 scn, `tournament-operations` 5 req/10 scn, `rating-projections` 4 req/8 scn, `legacy-migration-controls` 5 req/10 scn).

| Capability | Requirement | Scenarios | Status | Evidence |
|---|---|---|---|---|
| platform-foundation | Environment and migration integrity | 2/2 | COMPLIANT | Migration replay verified above; CI `install→lint→unit-test→db-migrations→build→e2e→audit` linear chain confirmed via `python3 -c "import yaml..."` parse of `.github/workflows/ci.yml` |
| platform-foundation | Validated commands and structured errors | 2/2 | COMPLIANT | `src/lib/errors.js`/`_shared/errors.ts` (6/6 unit); every RPC uses `request_id`/`command_outcomes` idempotency (verified in `0009`,`0010`,`0011`,`0013`) |
| platform-foundation | Least-privilege data access | 2/2 | COMPLIANT | `0004_rls_policies.sql` read directly: explicit `revoke all` then targeted grants + RLS on every table (13 `enable row level security` statements); `0005_public_views.sql` read directly: explicit column allowlists, no `select *`; `rls_deny_by_default`+`public_projection` pgTAP 15/15 |
| platform-foundation | Audit and operational evidence | 1.5/2 | PARTIAL | `audit_events` insert present in every sensitive RPC (`0006`,`0008`,`0009`,`0010`,`0011`,`0013` — grepped directly); `log.js` 4/4 unit. **"Failed or suspicious action" scenario's "alerted as appropriate" clause is not met** — confirmed no paging/alerting integration exists anywhere (grep-verified, matches proposal.md's own honest caveat) |
| platform-foundation | Stage 1 non-financial perimeter | 2/2 | COMPLIANT | `e2e/no-financial-ui.spec.js` 4/4; full-repo grep below found no leakage |
| authenticated-identity | Google authentication and session lifecycle | 2/2 | COMPLIANT | `SessionProvider.test.jsx` 5/5; `e2e/auth-onboarding.spec.js`, `e2e/session-routing.spec.js` (expiry) |
| authenticated-identity | Private profile with public allowlist | 2/2 | COMPLIANT | `profiles` table columns read directly (`user_id`,`username`,`username_normalized`,`display_name`,`avatar_url` only — no KYC/geo fields); RLS `profiles_select_self` |
| authenticated-identity | Atomic case-insensitive username claim | 2/2 | COMPLIANT | `username_claim_race.sql` 11/11 |
| authenticated-identity | Identity authorization and abuse controls | 2/2 | COMPLIANT | throttle assertions in `username_claim_race.sql`; unauthorized-denial pgTAP across RPCs |
| authenticated-identity | Non-financial identity boundary | 1/1 | COMPLIANT | Onboarding creates only `profiles`/`user_roles` rows (read directly in `0001`/`0003`) |
| tournament-operations | Validated tournament lifecycle | 1/2 | **PARTIAL — see CRITICAL finding below** | `lifecycle_rpc.sql` 8/8 covers *transitions* on an already-existing tournament. **No RPC, repository function, migration, or UI exists to create a tournament** — verified by exhaustive grep (`create_tournament`/`createTournament`/`insert into public.tournaments` found only inside `supabase/tests/*.sql` fixtures, never in application code) and by reading `src/App.jsx`'s complete route table (no create-tournament route) |
| tournament-operations | Registration and roster freeze | 2/2 | COMPLIANT | `roster_concurrency.sql` 13/13 |
| tournament-operations | Bracket and match invariants | 2/2 | COMPLIANT | `bracket_concurrency.sql` 11/11 |
| tournament-operations | Official result authority | 2/2 | COMPLIANT | `result_submission.sql` 9/9 |
| tournament-operations | Public projection and closed perimeter | 2/2 | COMPLIANT | `public_projection.sql` 7/7 (proves the batch-3 `security_invoker` fix holds) |
| rating-projections | Official-result rating events | 2/2 | COMPLIANT | `projector.test.js` 9/9; `rating_projection.sql` (subset) |
| rating-projections | Deterministic and retry-safe processing | 2/2 | COMPLIANT | `rating_projection.sql` idempotent-replay + version-conflict-review assertions |
| rating-projections | Correction and historical auditability | 2/2 | COMPLIANT | `0013_correction_rpc.sql` read directly (reason-required, supersedes not deletes); `rating_projection.sql` |
| rating-projections | Public leaderboard and privacy boundary | 2/2 | COMPLIANT | `public_leaderboard_view`/`public_player_history_view` read directly (allowlisted columns only); `e2e/leaderboard-history.spec.js` outage test |
| legacy-migration-controls | Explicit source-of-truth boundary | 2/2 | COMPLIANT | `adapterAvailability.js` + its 6/6 unit tests, read directly |
| legacy-migration-controls | Staged, environment-scoped rollout | 2/2 | COMPLIANT | `resolveAdapterFlag()` read directly (env-scoped, reversible, honored in production); README's rollback runbook |
| legacy-migration-controls | Expand, verify, and retire safely | 2/2 | COMPLIANT | `docs/legacy-retirement.md` per-module checklist confirmed accurate against current code (see below) |
| legacy-migration-controls | Legacy identity and financial isolation | 2/2 | COMPLIANT | `e2e/no-financial-ui.spec.js` 4/4; grep confirms no wallet/custody state created by identity onboarding |
| legacy-migration-controls | Migration audit and rollback evidence | 1.5/2 | PARTIAL (new, minor finding) | `0014_migration_audit.sql`/`migration_audit.sql` pgTAP 12/12 cover attributability/append-only/admin-read-only for `FLAG_CHANGE`/`ADAPTER_ERROR`. **"Retry or concurrent migration" scenario has no direct implementing test**: `ROLLBACK`/`RECONCILIATION` event types exist in the schema's check constraint but have no writer, and there is no literal "migration coordinator" resume/retry concept in this codebase (the "migration" here is code-level flag-gating, not per-record data migration) — the scenario doesn't map cleanly onto the built architecture. Non-blocking; not previously documented, worth a follow-up note in `docs/legacy-retirement.md` |

**Compliance summary**: 45/47 scenarios fully compliant, 2 PARTIAL (both explained above, one already honestly documented by the apply batches, one new minor finding), 0 FAILING, 0 UNTESTED-blocking. The 24th requirement (tournament creation) is the substantive new finding — see Issues below.

### Correctness — targeted source-level spot checks (read directly, not from tasks.md narrative)

| Area | Status | Notes |
|---|---|---|
| RLS deny-by-default on every table | Confirmed | Read `0004_rls_policies.sql` in full: explicit `revoke all ... from anon, authenticated` up front, then `enable row level security` on all 13 tables introduced in `0001`-`0003`, plus the same pattern independently applied to `migration_events` in `0014` |
| Roles as DB-grants only, never client/JWT-claim trust | Confirmed | `0001_roles_and_grants.sql`: `user_roles` table + `has_role()` SQL function checking only that table; grepped every `insert into public.user_roles` across all 15 migrations — only two exist: the default-`'user'` trigger (`0001`) and the fixed-email `'admin'` bootstrap (`0002`). **No migration ever grants `'organizer'`** — confirms the orchestrator's pre-verify note is accurate |
| `security_invoker=false` public views expose only allowlisted columns | Confirmed | Read `0005_public_views.sql` in full: all 4 views use explicit `select <column list>`, zero `select *`, each with a documented rationale for the deliberate `security_invoker` omission |
| Admin bootstrap grants only the fixed email | Confirmed | Read `0002_admin_bootstrap.sql`: `where email = 'lleonalmaza@gmail.com'`, idempotent `on conflict do nothing` |
| No service-role key in client code | Confirmed | `grep -rni "SERVICE_ROLE\|service_role" src/` → zero matches |
| CI gate order | Confirmed | Parsed `.github/workflows/ci.yml` with `python3`/`yaml`: exact linear chain `install→lint→unit-test→db-migrations→build→e2e→audit`, matches task 7.1's claim |

### Scope-leakage grep (crypto/wallet/deposit/withdraw/custody/kyc/monetiz across `src/`, `supabase/`, `docs/`, `README.md`, `e2e/`)

Ran independently; every non-obviously-safe match was individually inspected. All hits are one of: (a) `crypto.randomUUID()` (Web Crypto API, unrelated to cryptocurrency), (b) the Postgres `pgcrypto` extension, (c) tournament-registration "withdraw" (`withdraw_participant`/`withdrawParticipant`, roster withdrawal — not a financial withdrawal), or (d) the already-flagged, flag-gated legacy demo wallet/market UI (`/wallet`, `useWalletStore`, `BuySharesPanel`, `WalletPage`, `MarketDetailPage`, `PositionRow`), which `e2e/no-financial-ui.spec.js` proves is unreachable in a production build. **No unflagged scope leakage found.**

### Known-item confirmations (per instruction: verify accuracy, do not re-litigate as new)

1. **Task 0.3 / `.env.example`**: file exists at repo root (confirmed via `ls`); this session's sandbox also denies Read/Bash access to it, exactly as documented. Not treated as a defect.
2. **`/organizador` role-gate provisioning gap**: confirmed accurate on both claims — (a) `advance_tournament_state`'s real authority is ownership-based (`v_tournament.organizer_id <> v_user_id and not has_role('admin')` → `FORBIDDEN`, read directly in `0008_lifecycle_rpc.sql`), not a role check; (b) `e2e/session-routing.spec.js` genuinely depends on the client-side role gate — its 6.2/6.3 tests use `stubBootstrapSession(page, { roles: ['user', 'organizer'] })`, a role no real user can ever hold today, to reach the route at all. This is real, non-blocking, and honestly documented; not re-flagged as new.
3. **"Alerts" not implemented**: confirmed via grep — no Sentry/PagerDuty/webhook/alerting integration anywhere in `src/` or `supabase/functions/`. Accurately represented in `proposal.md` (checked with an inline caveat, not silently claimed done).
4. **Phase 5 legacy-migration-controls closure**: confirmed the two gaps a mid-apply validator flagged are genuinely closed — `resolveAdapterFlag()` is real and env-scoped (read directly, honored in every environment), and `0014_migration_audit.sql` + its pgTAP (12/12) prove attributable/append-only/admin-read-only migration events. One residual, previously-undocumented minor gap noted above (the "Retry or concurrent migration" scenario has no literal test/writer).

### Issues Found

**CRITICAL** (1, new — not previously documented anywhere in `tasks.md`, `docs/legacy-retirement.md`, `design.md`, or `proposal.md`):

1. **No application path exists to create a tournament.** Exhaustive search (`grep -rl "createTournament\|create_tournament\|insert into public.tournaments"` across `supabase/` and `src/`, plus a full read of `src/App.jsx`'s route table and every exported function in `src/repositories/tournamentRepository.js`) found: no RPC, no Edge Function, no repository function, no UI route or form, and no seed/migration that creates a `tournaments` row. The only places a `tournaments` row is ever inserted are pgTAP test fixtures (run as the Postgres superuser, bypassing RLS entirely) and Playwright's network-level `page.route()` stubs (which fabricate the tournament object client-side and never touch the real backend). `design.md`'s own File Changes table planned a `tournament-command` Edge Function (alongside `bootstrap-session`/`claim-username`/`result-command`) that was never built; only `bootstrap-session` and `result-command` exist under `supabase/functions/`. The `tournaments` table's RLS policy (`tournaments_write_organizer`, in `0004_rls_policies.sql`) does technically permit an authenticated user to `insert` a row with `organizer_id = auth.uid()` via a raw PostgREST call, but nothing in the shipped SPA ever makes that call, and doing so would bypass the "Validated commands" pattern (no `request_id`/idempotency, no format-validity check, no audit event) that every other write in this system deliberately goes through. **Net effect**: in a real deployment, nobody — including the fixed-email admin — has any documented, app-driven way to bring a new tournament into existence. Every test proving "registration → freeze → bracket → result" (pgTAP and Playwright alike) implicitly assumes a tournament already exists, which is a real, unaddressed gap in the tournament-operations "Validated tournament lifecycle" requirement, and it means `proposal.md` success criterion 2's full claimed chain is not actually reachable end-to-end starting from zero in a live environment — only from an already-seeded database. This was not caught by any of the 5 apply batches, the mid-apply validator, or the pre-verify orchestrator note. **Recommendation**: either (a) implement a minimal `create_tournament` RPC + repository function + organizer-facing form (small, scoped addition, consistent with every other command in this system), or (b) if intentionally deferred, add an explicit, honest scope note to `proposal.md`/`docs/legacy-retirement.md` documenting that tournament instances are currently a manual/DBA-only bootstrap action, the same way admin-role bootstrap already is.

**WARNING** (4):

1. legacy-migration-controls "Migration audit and rollback evidence" requirement's "Retry or concurrent migration" scenario has no direct implementing test; `ROLLBACK`/`RECONCILIATION` `migration_events` types exist in schema but have no writer. New finding, non-blocking (no literal migration-coordinator concept exists in this architecture to test against).
2. platform-foundation "Audit and operational evidence" requirement's "alerted as appropriate" clause is not implemented (no paging/notification integration). Already honestly documented in `proposal.md`; confirmed still accurate, not silently claimed done.
3. `/organizador`'s role gate has no legitimate provisioning path (`'organizer'` role is never granted by any migration). Already documented in tasks.md's "Orchestrator note"; confirmed accurate on independent re-check of the RPC authority and the e2e test's dependency on the stubbed role.
4. `design.md`'s File Changes table planned a `claim-username` Edge Function; the shipped implementation instead calls `claim_username` directly as a Postgres RPC via PostgREST (no Edge Function wrapper). Functionally equivalent from a security standpoint (the RPC itself validates/authorizes server-side, same as the pattern `submit_official_result`/`result-command` uses), but the deviation from `design.md`'s stated file plan for both `claim-username` and `tournament-command` was never called out anywhere in the Apply Progress Log. Non-blocking, design-coherence note only.

**SUGGESTION** (1):

1. `Navbar.jsx`/`HomePage.jsx`'s Google-sign-in CTA still reads the legacy mock `useSessionStore` instead of the real `SessionProvider` (already tracked honestly in `docs/legacy-retirement.md` "Known deferred work" — confirmed still accurate, cosmetic only, no fabricated identity/financial state).

### Verdict

**FAIL** — one new CRITICAL finding (no application-level path to create a tournament) blocks a literal, from-zero reading of the tournament-operations capability and of `proposal.md`'s own claimed end-to-end success criterion. Every other dimension checked (99/99 pgTAP, 80/80 unit, 24/24 Playwright, lint/build clean, RLS/grant/view/admin-bootstrap security posture, no scope leakage, all previously-documented items confirmed accurate) is genuinely solid, independently re-verified, and not just self-reported. This is a scoped, well-understood gap with a clear remediation path (a small `create_tournament` command, or an explicit scope-deferral note) — recommend one more focused `sdd-apply` pass targeting this single gap before archiving, rather than blocking on it indefinitely.
