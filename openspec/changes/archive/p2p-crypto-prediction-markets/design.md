# Design: Non-custodial P2P crypto prediction markets

## Technical Approach

CTF-lite: two custom contracts (`MarketFactory`, `ResolutionAdapter`) over the deployed Gnosis `ConditionalTokens` singleton; pricing uses Gnosis's `FixedProductMarketMaker` (FPMM) implementation rather than new pricing code. Supabase keeps identity, start.gg ingestion, and a read cache — never custody. Frontend ships behind a default-off flag.

## Architecture

```
 FRONTEND (React 19 / Vite)          OFF-CHAIN (Supabase)              ON-CHAIN (Polygon Amoy)
 ┌──────────────────────┐    ┌──────────────────────────────┐   ┌──────────────────────────┐
 │ src/lib/web3/        │    │ functions/startgg-poller     │   │ MarketFactory            │
 │  wagmi+viem client   │──┐ │  → results/matches (0003)    │   │  bond escrow, questionId │
 │  useMarket/useTrade  │  │ │  ↳ fires 0012 rating trigger │   │  registry, FPMM deploy   │
 │ pages/… (flag-gated) │  │ │  ↳ fires 0018 (no-op)        │   ├──────────────────────────┤
 └──────────┬───────────┘  │ ├──────────────────────────────┤   │ ResolutionAdapter        │
            │ reads        │ │ functions/relayer            │──▶│  post/challenge/multisig │
            ▼              └▶│ functions/event-indexer      │◀──│  → CTF.reportPayouts     │
 Supabase read cache ◀───────┤  viem getLogs → cache tables │   ├──────────────────────────┤
 (onchain_markets/positions) │ Auth + profiles + wallet_links│  │ CTF singleton  │ FPMM     │
                             └──────────────────────────────┘   │ USDC collateral│ CPMM     │
                                                                └──────────────────────────┘
```

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Pricing | Gnosis FPMM (CPMM), creator seeds `MIN_LIQUIDITY` (100 USDC) | Pari-mutuel; custom AMM | The spec's pricing scenario ("shift proportional to trade size relative to **pool depth**") is CPMM semantics; pari-mutuel gives no live price or early exit. Reusing audited FPMM leaves zero custom pricing code. |
| 2 | Outcome slots | Always binary (`outcomeSlotCount = 2`) | N-slot per-tournament market | Per-tournament-winner ships as one binary "will X win" market per entrant. Avoids 2^N collection combinatorics and keeps one FPMM shape. |
| 3 | ID scheme (per `uma-ctf-adapter`) | `questionId = keccak256(abi.encode(startggEventId, marketType, outcomeRef))`; `conditionId = CTF.getConditionId(adapter, questionId, 2)`; `collectionId = CTF.getCollectionId(0x0, conditionId, indexSet∈{1,2})`; `positionId = CTF.getPositionId(USDC, collectionId)` | Sequential/registry IDs | Deterministic hashing makes duplicate detection a single on-chain `questionId` lookup, and `adapter` as oracle means only `ResolutionAdapter` can `reportPayouts`. |
| 4 | start.gg → `results` identity | Shadow `auth.users` per entrant (service-role Admin API, no-login) + `startgg_entrant_links`; one service organizer for `tournaments.organizer_id` | Relaxing FKs in 0003; skipping `results` writes | `memberships.user_id`/`results.winner_membership_id` are NOT NULL FKs to `auth.users`. Shadow users are the only way to satisfy the spec ("triggers fire unchanged") without editing an existing migration, which the rollback plan forbids. |
| 5 | Legacy trigger interaction | Ingestion MUST NOT write `public.markets` rows | Repointing 0018 | 0018 loops over `markets WHERE tournament_id = NEW.id`; with no rows it is a no-op, keeping play-money and on-chain products disjoint and 0016–0019 untouched. |
| 6 | Sanctions | `ISanctionsList` injected at deploy; Chainalysis oracle on mainnet, owner-settable mock on Amoy; `notSanctioned` modifier on create/buy/sell/redeem; **fails closed** if unset | Frontend-only geoblocking | Binds to address, not IP. Zero-address oracle reverts rather than permits. |
| 7 | Feature flag | New `resolveOptInFlag({envOverride}) => envOverride === 'true'` → `FEATURE_FLAGS.web3`; routes registered but resolve to `NotFoundPage` when off | Reusing `resolveAdapterFlag` (default ON) or `resolveDemoFinancialUIFlag` (prod hard-off) | Unaudited money code needs default-**off**-with-opt-in — a third semantic. Prod-hard-off would make the Amoy build unreachable. Mirrors `MarketDetailPage`'s existing gate + `e2e/no-financial-ui.spec.js` proof pattern. |

### Parameters (deferred by proposal — defaults chosen, adjustable)

| Parameter | Default | Justification |
|---|---|---|
| Result challenge window | 4 h (bounded configurable 2–24 h) | ~2× UMA OO's 2 h liveness for margin, still same-day redemption; long enough for a human multisig to react. |
| Creation challenge window | `min(60 min, time-to-event-start)` | A spam market must never become tradeable; markets on imminent matches simply never activate and the bond refunds. |
| Creation bond | 25 USDC | Polygon gas is cents, so gas never bounds this; the bond must dwarf spam value yet stay under `MIN_LIQUIDITY` so it isn't the creation barrier. |
| Challenger bond (creation) | 25 USDC, equal stake; slash split 50 % challenger / 50 % treasury | Symmetric stake deters griefing challenges as well as spam creation. |
| Result dispute bond | 100 USDC | A settlement dispute freezes every trader's collateral, so it must be materially more expensive than a creation challenge. |
| Relayer stake | 1 000 USDC global; 100 USDC slashed to disputer on overturn | Gives the relayer skin in the game without per-posting capital. |

All amounts are **testnet-calibrated and maintainer-adjustable**; mainnet calibration is a funding/risk decision, not a code decision. Stored as `MarketFactory`/`ResolutionAdapter` owner-settable constants.

## Flow 1 — Create → trade → ingest → post → settle (happy path)

```
Creator   Factory     CTF      FPMM   Poller   start.gg   results   Relayer  Adapter
  │ create+25 bond      │        │      │        │          │         │        │
  ├───────▶│ prepareCondition ──▶│      │        │          │         │        │
  │        │ deploy FPMM, seed 100 USDC ▶│       │          │         │        │
  │        │ state=PENDING (t+60m)│      │        │          │         │       │
  │ …window elapses, no challenge → ACTIVE, bond refunded   │         │        │
Trader ───▶│ buy: notSanctioned → USDC → splitPosition → ERC-1155 ────│        │
  │        │                     │      ├─ poll cycle ─────▶│         │        │
  │        │                     │      │ set COMPLETED ───▶│ insert  │        │
  │        │                     │      │   (0012 rating trigger fires)│       │
  │        │                     │      │        │          ├────────▶│ postResult
  │        │                     │      │        │          │         ├──▶ PROPOSED (t+4h)
  │        │  …window elapses, no dispute…                   │         │  settle()
  │        │◀──────────────── CTF.reportPayouts [1,0] ───────┼─────────┼────────┤
Trader ───▶│ redeemPositions → USDC (notSanctioned re-checked)        │        │
```

## Flow 2 — Creation-bond dispute (duplicate / malformed)

```
Creator ─▶ Factory.createMarket(questionId, 25 USDC)  → PENDING, bond locked
Challenger ─▶ Factory.challengeCreation(questionId, 25 USDC)
                 │ same questionId already ACTIVE?  → duplicate evidence
                 │ startggEventId absent from ingestion registry? → malformed
                 ▼ state = CHALLENGED, both bonds escrowed, activation frozen
Multisig ─▶ Adapter.ruleCreation(questionId, upheld)
      upheld=true  → market VOID, never tradeable; creator bond slashed
                     → 12.5 USDC challenger + 12.5 USDC treasury; seed liquidity
                       returned to creator (liquidity is not slashable)
      upheld=false → challenger bond → creator; market ACTIVE at window end
```

Timeout guard: if the multisig does not rule within 7 days, both bonds refund and the market voids (fail-safe, never fail-open into tradeable).

## Data Model (additive migrations only — 0020+, no edits to 0003/0016–0019)

| Table | Key columns | Purpose |
|---|---|---|
| `wallet_links` | `user_id uuid PK → auth.users`, `address text UNIQUE`, `chain_id`, `siwe_nonce`, `linked_at` | 1:1 both directions enforced by PK + UNIQUE (spec: second link rejected). |
| `startgg_entrant_links` | `startgg_entrant_id bigint PK`, `user_id uuid UNIQUE → auth.users` | Shadow-user mapping for ingestion (Decision 4). |
| `startgg_ingestion_cursor` | `source_key text PK`, `last_polled_at`, `last_completed_at`, `backoff_until`, `cycle_requests` | Round-robin cursor + 429 backoff state. |
| `onchain_markets` | `condition_id text PK`, `question_id`, `startgg_event_id`, `market_type`, `creator_address`, `state`, `fpmm_address`, `block_number` | Read cache. |
| `onchain_positions` | PK `(condition_id, holder_address, position_id)`, `balance` | Read cache. |
| `creation_bonds` | `question_id text PK`, `creator`, `amount`, `state`, `challenger`, `ruled_at` | Bond-ledger mirror (on-chain remains source of truth). |
| `onchain_events_cursor` | `contract_address text PK`, `last_block`, `last_log_index` | Indexer idempotency. |

Indexer reads only up to `latest - 20` blocks (Polygon reorg depth) and upserts by `(block_number, log_index)`.

## Polling budget (~80 req/60 s)

One cron edge function per 60 s, self-capped at 60 requests (25 % headroom for retries). Lanes: (a) live `sets` per active-market tournament, 1 paginated request each; (b) `standings` only on tournament-state flip; (c) MX discovery `tournaments(filter:{countryCode:"MX"})` once per 10 cycles. Round-robin cursor guarantees neither market type starves; a 429 writes `backoff_until` and the cycle resumes at the cursor with nothing dropped.

## File Changes

| Path | Action | Description |
|---|---|---|
| `contracts/` (Foundry) | Create | `src/MarketFactory.sol`, `src/ResolutionAdapter.sol`, `src/interfaces/{IConditionalTokens,IFPMM,ISanctionsList}.sol`, `test/`, `script/Deploy.s.sol` |
| `supabase/migrations/0020_wallet_and_onchain_cache.sql` | Create | All seven tables above + RLS (public read on cache, service-role write) |
| `supabase/functions/startgg-poller/index.ts` | Create | MX polling → `results`/`matches` via shadow identities |
| `supabase/functions/event-indexer/index.ts` | Create | viem `getLogs` → cache tables |
| `supabase/functions/relayer/index.ts` | Create | Signs and posts results; key in Supabase secrets |
| `src/lib/web3/{client,contracts,hooks}.js` | Create | wagmi/viem config + contract hooks |
| `src/config/featureFlags.js` | Modify | Add `resolveOptInFlag` + `FEATURE_FLAGS.web3` |
| `src/App.jsx` | Modify | Register web3 routes behind `FEATURE_FLAGS.web3` |
| `src/auth/SessionProvider.jsx` | Modify | Optional SIWE wallet link (never required for trading) |
| `.github/workflows/` | Modify | `forge test --fuzz-runs`, `forge coverage`, Slither gate |

## Interfaces

```solidity
function createMarket(bytes32 questionId, uint256 startggEventId, uint8 marketType,
                      uint256 seedLiquidity) external returns (bytes32 conditionId); // pulls bond + seed
function challengeCreation(bytes32 questionId) external;      // pulls challenger bond
function postResult(bytes32 questionId, uint8 winningIndex, bytes32 resultRef) external onlyRelayer;
function disputeResult(bytes32 questionId) external;          // reverts for relayer
function rule(bytes32 questionId, uint8 winningIndex) external onlyMultisig;
function settle(bytes32 questionId) external;                 // reverts inside challenge window
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Contract unit/fuzz | ID hashing vs live CTF, bond accounting, window boundaries, sanctions fail-closed, relayer self-dispute revert | `forge test` + fuzz on trade size / timestamps |
| Static | Reentrancy, access control | Slither in CI (gate) |
| DB | Ingested result fires 0012 unchanged; 0018 stays a no-op; `wallet_links` 1:1 rejection | pgTAP in `supabase/tests/` (existing pattern) |
| Unit (JS) | `resolveOptInFlag` defaults off; indexer reorg/idempotency | Vitest |
| E2E | Web3 routes 404 with flag off (mirrors `e2e/no-financial-ui.spec.js`); connect → buy → redeem on Amoy fork | Playwright |

## Threat Matrix

| Boundary | Applicability | Response |
|---|---|---|
| Documentation-like paths | N/A — no file-classification or execution-from-file boundary | — |
| Git repository selection | N/A — no VCS automation | — |
| Commit state | N/A — no VCS automation | — |
| Push state | N/A — no VCS automation | — |
| PR commands | N/A — no PR automation | — |

Domain boundaries carried to tasks instead: sanctions-oracle fail-closed on zero address; relayer key held only in Supabase secrets, never in the bundle; multisig-timeout fail-safe to VOID; indexer reorg depth; start.gg 429 backoff without data loss. Each gets a RED test per the table above.

## Migration / Rollout

Additive migration 0020 only. Amoy-only deploy; `FEATURE_FLAGS.web3` defaults off, so a plain build is byte-identical in behavior to today. Rollback = leave the flag off and stop the three edge functions; no data recovery needed.

## Open Questions

Resolved by maintainer (2026-08-15):
- [x] **`MIN_LIQUIDITY` (100 USDC)**: kept as-is. Accepted as a real (if small) barrier to creation rather than adding treasury-funded protocol seeding — no treasury/fund-recovery mechanism needed for this change.
- [x] **Shadow `auth.users` side effect**: ingested start.gg entrants are intended to appear in `/ranking` alongside registered GG2 players — no leaderboard filter added. Reflects real tournament results; revisit only if this becomes an actual complaint.

Still open (non-blocking, do not gate `sdd-tasks`):
- [ ] **Bond/liquidity amounts** are testnet placeholders — mainnet calibration is maintainer-owned (Decision table).
- [ ] **Multisig composition** (m-of-n, signer identities, SLA vs. the 7-day timeout) — maintainer, needed before any real deploy but not before tasks/apply on Amoy.
- [ ] Verify at implementation time whether a canonical Gnosis FPMM factory is deployed on Amoy; if not, deploy FPMM from source (adds it to the audit surface).
- [ ] Non-SSBU start.gg events have no `tournament_formats` row (only 0007 seeds one). Default: skip non-SSBU events for this change (matches current single-format scope); expanding formats is separate future scope, not required here.
