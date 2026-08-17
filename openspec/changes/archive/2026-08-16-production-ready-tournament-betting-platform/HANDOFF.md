# Handoff: production-ready-tournament-betting-platform (Stage 1)

Date: 2026-08-12
Workflow: OpenSpec-driven development (Gentle AI / Claude Code CLI), single change, single PR
Repo: `GG2` — React 19/Vite 8 SPA + Supabase (Postgres/Auth/RLS/Edge Functions)

## TL;DR for whoever picks this up

67 of 73 planned tasks are done and independently re-verified. The remaining 6 tasks (Phase 8, below) close one real, well-understood gap: **there is currently no way to create a tournament from the app itself.** Everything downstream of "a tournament already exists" — registration, roster freeze, bracket generation, official results, ratings, leaderboard, history — is built, tested, and verified. Read this file, then `openspec/changes/production-ready-tournament-betting-platform/tasks.md`'s **"Phase 8: Deferred to Follow-Up"** section for the exact scope of what's left.

## How to resume with the SDD tooling

```bash
cd GG2
gentle-ai sdd-status production-ready-tournament-betting-platform --cwd "$(pwd)" --json --instructions
```

This will report `nextRecommended: apply` with 6 pending tasks (Phase 8). If you're using Claude Code + Gentle AI, you can just say: *"Continue the OpenSpec change production-ready-tournament-betting-platform — run native SDD status first, then implement Phase 8."*

All planning artifacts (`proposal.md`, `design.md`, the 5 capability specs under `specs/`, `tasks.md`, `verify-report.md`) already exist and are approved — do not recreate them, only extend `tasks.md` if the scope of Phase 8 needs to change.

## What's built (Stage 1 scope)

- **Identity**: Google OAuth via Supabase Auth, atomic case-insensitive username claim (race-safe, throttled), session state machine, role/ownership route guards.
- **Tournament operations**: one launch config — Super Smash Bros. Ultimate, 1v1 singles, single-elimination, 8-participant roster, best-of-3 score schema. Lifecycle (`DRAFT→REGISTRATION_OPEN→REGISTRATION_CLOSED→IN_PROGRESS→COMPLETED`), registration/roster-freeze, deterministic bracket generation, organizer/referee-authorized official results with an audited correction path.
- **Ratings**: append-only rating events projected from official results, versioned snapshots, public leaderboard/player-history views.
- **Legacy migration controls**: reversible environment-scoped adapter flags, an append-only `migration_events` audit table, the old mock/localStorage/wallet/market/prediction UI isolated behind a flag that's hard-off in every production build (never deleted, per the "expand/verify/retire" spec requirement).
- **Platform foundation**: Postgres schema, deny-by-default RLS on every table, roles as DB grants only (`user`/`organizer`/`referee`/`admin`, never trusted from a client/JWT claim), a fixed-email admin bootstrap migration, structured errors, correlated logging.
- **Security**: independently re-verified by a fresh-context review during apply (public views checked column-by-column for leakage — safe) and again during `sdd-verify` (RLS/grants/admin-bootstrap re-confirmed).
- **Tests**: 80 Vitest unit tests, 99 pgTAP assertions across 10 suites (run against a real `supabase/postgres:15.8.1.049` container), 24 Playwright e2e tests including a full routing threat-matrix (token expiry, direct-URL access, forged role claims, hostile redirects) — all independently re-run and passing as of `verify-report.md`.

Stage 1 explicitly excludes real cryptocurrency, wallets, deposits/withdrawals, custody, KYC collection, monetized predictions, and any legal-wagering claims — those are later, legally-gated programs, not part of this change.

## What's NOT built yet — Phase 8

**The gap**: no RPC, Edge Function, repository function, UI route, or migration/seed ever inserts a `tournaments` row anywhere in application code. Every test creates one as a raw database fixture. `design.md` planned a `tournament-command` Edge Function for this and it was never built — this was missed by all 5 implementation batches and only caught by the final independent verification pass.

**What's needed** (full detail with file/convention pointers in `tasks.md`'s Phase 8):
1. A `create_tournament` RPC, following the same idempotent/audited pattern already used by every other write in this change.
2. A repository function calling it.
3. A minimal "create tournament" UI, most naturally added to the already-built, already-role-gated `OrganizerPanelPage.jsx`.
4. pgTAP tests for authorization/idempotency.
5. A Playwright test proving the full chain works from a genuinely empty database, not just from a pre-seeded fixture.
6. Re-verify (`sdd-verify`) once done, then this change can be archived.

**Two smaller, non-blocking items also worth picking up alongside Phase 8** (both already documented in `tasks.md`, neither is a security issue):
- No migration currently grants the `'organizer'` role, so the real fix for #1-3 above should probably also decide how a user actually becomes an organizer (self-serve on creation? admin-granted?) rather than just wiring the RPC.
- `Navbar.jsx`/`HomePage.jsx` still read the old mock session store for the "sign in" button's visual state, so a real Google sign-in currently leaves the navbar looking logged out even though the user genuinely is signed in. Cosmetic, not a functional or security bug.

## Where to look

- `proposal.md` — what this change is and its (now honestly corrected) success criteria.
- `design.md` — architecture and the file-changes plan (including the never-built `tournament-command` Edge Function this handoff is about).
- `specs/*/spec.md` — the five capability contracts (Given/When/Then, RFC 2119 language) everything was built against.
- `tasks.md` — the full task list, checkbox state, and a very detailed "Apply Progress Log" documenting every batch, every real bug found and fixed, and every deliberate scope decision made along the way. Long, but worth reading if you want the full history.
- `verify-report.md` — the final independent verification pass: what was re-run, what passed, and the Phase-8 gap this handoff is about.

## Everything else

No application code outside this repo's normal git history was touched improperly; all changes are plain commits/working-tree edits, nothing force-pushed or hidden. `.env.example` exists at the repo root — its contents were confirmed correct by the project maintainer directly (a sandbox permission boundary blocked the AI agents from reading it themselves).
