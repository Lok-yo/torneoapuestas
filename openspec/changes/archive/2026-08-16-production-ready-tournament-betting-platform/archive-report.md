# Archive Report — `production-ready-tournament-betting-platform`

**Change**: `production-ready-tournament-betting-platform`
**Archived on**: 2026-08-16
**Archived to**: `openspec/changes/archive/2026-08-16-production-ready-tournament-betting-platform/`
**Artifact store mode**: `openspec`
**Branch**: `feat/tournament-platform-stage1` (NOT yet merged to `main`)
**Result**: ✅ ARCHIVED — SDD cycle complete (plan → implement → verify → archive)

---

## Executive Summary

This change delivered the Stage 1 non-financial, production-ready tournament betting
platform foundation: authenticated identity, platform foundation (validated commands,
least-privilege data access, audit/operational evidence, stage-1 non-financial perimeter),
tournament operations (validated tournament lifecycle), rating projections, and
legacy-migration controls. All 73/73 implementation tasks are complete. The change
passed native SDD verification (`24/24` requirements, `46/46` scenarios, verdict **PASS**).

Two corrections were applied **after** the original verification snapshot and are recorded
here as the authoritative final state (the archive report is the terminal record; it does
not echo the stale pre-correction snapshot as current fact):

1. **Scenario count corrected** (`47 → 46`): the original run miscounted
   `platform-foundation` as 10 scenarios; the spec actually contains 9. Post-correction top-line:
   `24/24` requirements, `46/46` scenarios.
2. **Two originally-PARTIAL scenarios closed with real code** in
   `supabase/migrations/0021_verify_remediation.sql` + two new pgTAP suites
   (`security_alerts.sql` 10/10, `migration_retry_idempotency.sql` 8/8), behind a bounded
   native remediation attempt. These were NOT merely documented — they shipped.
3. **Original blocking finding (no tournament-creation path) RESOLVED by the product pivot**
   to start.gg as tournament authority; `supabase/functions/startgg-poller/index.ts` upserts
   tournaments server-side (commit `251a8b8`). The internal organizer-creation UI was
   deliberately soft-retired. This was a product decision, not a gap-patch.

A subsequent change, `p2p-crypto-prediction-markets` (archived), built the on-chain
prediction-market layer behind `VITE_FEATURE_WEB3` (default off) on top of this foundation.

---

## Final State (authoritative — per Final-State Authority hierarchy)

### Source of truth updated (main specs created)
The five delta specs were NEW capabilities; `openspec/specs/` had no prior merged specs.
Each delta spec was copied verbatim (mechanical `cp`, byte-identical `diff -r` readback) into
the main spec tree:

| Capability (domain) | Action | Main spec path |
|---|---|---|
| `platform-foundation` | Created (full spec) | `openspec/specs/platform-foundation/spec.md` |
| `authenticated-identity` | Created (full spec) | `openspec/specs/authenticated-identity/spec.md` |
| `tournament-operations` | Created (full spec) | `openspec/specs/tournament-operations/spec.md` |
| `rating-projections` | Created (full spec) | `openspec/specs/rating-projections/spec.md` |
| `legacy-migration-controls` | Created (full spec) | `openspec/specs/legacy-migration-controls/spec.md` |

Totals: **24 requirements / 46 scenarios** now live in the main spec tree.

### Task completion (Task Completion Gate)
`tasks.md` shows **73/73 tasks checked** (`- [x]`), 0 unchecked. Gate passes; archive
contains no stale unchecked implementation tasks.

### Native review gate
`reviewGate` is structurally absent from the status output (kill switch off / no review
discovered for this candidate). Archive proceeds under ordinary repository policy.

---

## Verification Evidence (final — clean container, migrations 0000–0021)

Per the corrected and natively re-admitted verify-report (`verify-report.md`, verdict **PASS**):

- **pgTAP**: 16/16 suites, **144/144 assertions** (12 pre-existing + 2 new remediation suites;
  the two p2p-era suites `prediction_markets` and `wallet_ledger` got a dual JWT-GUC test-env fix).
- **vitest**: **93/93** passing.
- **lint**: clean (pre-existing warnings only).
- **build**: `npm run build` succeeds.
- **Playwright e2e** (real build + preview): 24/24 passing (auth-onboarding, leaderboard-history,
  no-financial-ui, session-routing, tournament-flow).

### Post-verification remediation details (commit `93aaf73`)
- **Security-alert elevation** (`platform-foundation` / "Failed or suspicious action"):
  FAILED/DENIED `audit_events` elevate via `security_audit_alert_trg` into a new admin-read-only
  `security_alerts` queue (HIGH for DENIED, MEDIUM for FAILURE) with sanitized payloads
  (sensitive keys `token`, `password`, `secret`, `key`, `authorization`, `jwt`, `credential`,
  `api_key`, `service_role`, … stripped). Proven by `security_alerts.sql` (10/10).
- **Request_id-idempotent migration events** (`legacy-migration-controls` / "Retry or concurrent
  migration"): `record_migration_event()` gained a `request_id` idempotency key + partial unique
  index; replay returns the original id flagged `idempotent_replay`. `ROLLBACK`/`RECONCILIATION`
  became first-class recordable writers. Client `src/repositories/migrationEventRepository.js`
  passes `request_id`. Proven by `migration_retry_idempotency.sql` (8/8).

### Pivot resolution (commit `251a8b8`)
The original verification blocking finding — no app-level tournament-creation path — is resolved
by the start.gg pivot: `supabase/functions/startgg-poller/index.ts` upserts tournaments
server-side with the service role. The internal organizer-creation UI was soft-retired intentionally.

---

## Commits

| Commit | Contents |
|---|---|
| `251a8b8` | P2P implementation on this branch; start.gg poller (tournament authority pivot) |
| `93aaf73` | Verify remediation migration `0021` + two new pgTAP suites; report correction/re-admission |

> ⚠️ **Open operational step**: branch `feat/tournament-platform-stage1` is **NOT yet merged to
> `main`**. Merging is the orchestrator's responsibility after review; archive is an audit trail
> and does not perform the merge.

---

## Remaining Documented, Non-Blocking Follow-ups

From the verify-report (WARNINGs/SUGGESTION, all non-blocking; several narrowed by the pivot):

1. **Organizer-role provisioning path** — narrowed by the pivot (organizer creation retired);
   still worth a deliberate decision.
2. **`design.md` file-plan deviation notes** — the planned `tournament-command` Edge Function was
   never built; lifecycle is now poller-driven. Documented as deviation.
3. **Navbar / HomePage legacy mock-session CTA** — legacy UI still offers a mock-session entry point.
4. **External paging integrations** — alerts/external paging integrations absent (WARNING).
5. **Retry-migration scenario** was originally untested; now covered by `migration_retry_idempotency.sql`
   (closed). Listed only for traceability.

---

## Next Steps

- Merge `feat/tournament-platform-stage1` → `main` (orchestrator action; not performed by archive).
- Address the four non-blocking follow-ups above in future changes.
- Future work on tournament ingestion should reference the start.gg poller as the authority per the
  archived `p2p-crypto-prediction-markets` change and the soft-retired organizer UI.

---

## Next Recommended (SDD)

Change is archived → no active SDD phase. Return to orchestrator. If a new capability is needed,
start with `sdd-explore` / `sdd-propose`.

---

*Mechanical integrity: spec sync and archive move both verified by `diff -r` (empty output = PASS).
Archive is an immutable audit trail — do not modify.*
