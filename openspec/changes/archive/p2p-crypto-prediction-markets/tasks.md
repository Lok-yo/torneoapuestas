# Tasks: Non-custodial P2P crypto prediction markets on start.gg-sourced tournaments

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2500–3500 (Foundry contracts+tests, migration, 3 edge functions, wagmi/viem layer, CI) |
| Project review_budget_lines override | 1000 (config.yaml) — estimate still exceeds it |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Contracts → DB/migration → Edge functions → Frontend |
| Delivery strategy | single-pr (config.yaml) |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (if exception not granted, use these slices)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Foundry contracts (Phases 1–6) | PR 1 | `forge test --fuzz-runs 256` | Anvil/Amoy fork `forge test` | Revert `contracts/`, nothing deployed |
| 2 | Migration + invariants (Phase 7) | PR 2 | `supabase test db` (pgTAP) | Local Supabase CLI | Drop additive `0020_*.sql`, no data touched |
| 3 | Edge functions (Phases 8–10) | PR 3 | `deno test supabase/functions` | `supabase functions serve` | Undeploy 3 functions; ingestion inert w/o them |
| 4 | Frontend + flag (Phases 11–13) | PR 4 | `npm run lint && npx vitest` | Playwright vs Amoy fork | Flag stays off — byte-identical UI |

## Phase 1: Foundry Foundation

- [x] 1.1 Init `contracts/` Foundry workspace (foundry.toml, forge-std, OZ deps).
- [x] 1.2 Add `contracts/src/interfaces/{IConditionalTokens,IFPMM,ISanctionsList}.sol`.

## Phase 2: Threat-Matrix RED Tests (domain boundaries, before production code)

- [x] 2.1 RED `contracts/test/SanctionsFailClosed.t.sol`: zero-address oracle reverts (fail-closed).
- [x] 2.2 RED `contracts/test/MultisigTimeout.t.sol`: no ruling in 7d → VOID + refund, never ACTIVE.
- [x] 2.3 RED `supabase/functions/relayer/relayer.secret.test.ts`: signer key absent from bundle/logs/response.
- [x] 2.4 RED `supabase/functions/event-indexer/reorg.test.ts`: logs within `latest-20` ignored.
- [x] 2.5 RED `supabase/functions/startgg-poller/backoff.test.ts`: 429 backs off, resumes, no data loss.

## Phase 3: MarketFactory (Decisions 1–3)

- [x] 3.1 `MarketFactory.sol`: `createMarket()` — questionId/conditionId hash (Decision 3), pulls 25 USDC bond + ≥100 USDC seed, deploys FPMM, PENDING.
- [x] 3.2 Reject `createMarket()` for unknown `startggEventId` before bond lock.
- [x] 3.3 `challengeCreation()`: 25 USDC challenger bond, CHALLENGED, freeze activation.
- [x] 3.4 `ruleCreation()` onlyMultisig: slash/refund split, 7-day timeout fail-safe void (GREEN 2.2).
- [x] 3.5 Creation window `min(60min, time-to-event)`, unchallenged → ACTIVE + bond refund.

## Phase 4: ResolutionAdapter

- [x] 4.1 `ResolutionAdapter.sol`: `postResult()` onlyRelayer → PROPOSED-RESULT + timestamp.
- [x] 4.2 `disputeResult()`: 100 USDC bond; relayer self-dispute reverts.
- [x] 4.3 `rule()` onlyMultisig: uphold/overturn settlement, slash/refund per spec.
- [x] 4.4 `settle()`: reverts mid-window; calls `CTF.reportPayouts` on finalize.
- [x] 4.5 `notSanctioned` modifier on create/buy/sell/redeem, both contracts (GREEN 2.1).

## Phase 5: Contract Test Suite

- [x] 5.1 `test/IdHashing.t.sol`: questionId/conditionId/positionId vs live CTF fork.
- [x] 5.2 `test/BondAccounting.t.sol` fuzz: creation/challenge/dispute bonds, slash splits.
- [x] 5.3 `test/WindowBoundaries.t.sol` fuzz: challenge/creation window edges.
- [x] 5.4 `test/RelayerSelfDispute.t.sol`: self-dispute reverts.
- [x] 5.5 `script/Deploy.s.sol`: Amoy deploy, sanctions-oracle mock wiring.

## Phase 6: CI Gate

- [x] 6.1 `.github/workflows/`: add `forge test --fuzz-runs`, `forge coverage` job.
- [x] 6.2 Add Slither gate (reentrancy, access control) blocking merge.

## Phase 7: Migration + Invariant Tests (Decisions 4–5)

- [x] 7.1 `supabase/migrations/0020_wallet_and_onchain_cache.sql`: 7 tables + RLS (public read cache, service-role write).
- [x] 7.2 pgTAP: 0012 rating trigger fires unchanged on ingested `results` write.
- [x] 7.3 pgTAP: 0018 auto-resolve trigger stays no-op (ingestion never writes `public.markets`).
- [x] 7.4 pgTAP: `wallet_links` 1:1 — second link rejected.

## Phase 8: startgg-poller (GREEN 2.5)

- [x] 8.1 `supabase/functions/startgg-poller/index.ts`: MX filter, round-robin lanes a/b/c, 60 req/cycle cap.
- [x] 8.2 Write shadow `auth.users` + `startgg_entrant_links` per new entrant (Decision 4).
- [x] 8.3 Write sets/standings into `results`/`matches` unchanged schema.
- [x] 8.4 429 backoff via `startgg_ingestion_cursor.backoff_until`, resume at cursor (GREEN 2.5).

## Phase 9: event-indexer (GREEN 2.4)

- [x] 9.1 `supabase/functions/event-indexer/index.ts`: viem `getLogs` → upsert `onchain_markets`/`onchain_positions` by `(block_number, log_index)`.
- [x] 9.2 Enforce `latest-20` reorg floor (GREEN 2.4); update `onchain_events_cursor`.

## Phase 10: relayer (GREEN 2.3)

- [x] 10.1 `supabase/functions/relayer/index.ts`: signs `postResult()` from `results`/`matches`; key read only from Supabase secrets (GREEN 2.3).

## Phase 11: Web3 Frontend Layer

- [x] 11.1 `src/config/featureFlags.js`: add `resolveOptInFlag` + `FEATURE_FLAGS.web3` (default off).
- [x] 11.2 `src/lib/web3/client.js`: wagmi/viem Amoy config.
- [x] 11.3 `src/lib/web3/contracts.js`: ABIs + deployed addresses.
- [x] 11.4 `src/lib/web3/hooks.js`: `useMarket`/`useTrade`/`useWalletConnect`.
- [x] 11.5 `src/App.jsx`: register web3 routes, resolve `NotFoundPage` when flag off.

## Phase 12: Frontend Wiring

- [x] 12.1 Repoint `WalletPage`/`MarketDetailPage.jsx` to on-chain hooks (flag-gated).
- [x] 12.2 `PredictionMarketAdminPanel.jsx`: read-only view over on-chain markets (no approval gate).
- [x] 12.3 `SessionProvider.jsx`: optional SIWE wallet link, never trade-required.
- [x] 12.4 Soft-retire legacy play-money UI entries (hide only; 0016–0019 untouched).

## Phase 13: JS/E2E Tests

- [x] 13.1 Vitest: `resolveOptInFlag` defaults off.
- [x] 13.2 Vitest: indexer reorg/idempotency helper coverage.
- [x] 13.3 Playwright: web3 routes 404 with flag off (mirrors `e2e/no-financial-ui.spec.js`).
- [x] 13.4 Playwright: connect → buy → redeem on Amoy fork.

## Phase 14: Deferred (placeholder, non-blocking)

- [x] 14.1 Doc note: mainnet bond calibration + multisig composition remain maintainer-owned, deferred to a separate mainnet-deploy change — no implementation task here.
