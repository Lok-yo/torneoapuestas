# Exploration: Non-custodial P2P crypto prediction markets (USDC/Polygon) layered on GG2 tournaments

## Product redirect (2026-08-15)

Scope refined after feedback from a professor/classmates: GG2 stops being the tournament-authority (organizer creates tournament, manages bracket, submits official result) and becomes a **prediction-market layer on top of tournaments sourced from the start.gg API**, filtered to Mexico. Rationale: two-sided marketplaces (tournaments + bettors) are hard to bootstrap simultaneously; start.gg is already the de-facto tournament infra for this scene (competitive gaming/Smash), so building a competing tournament CMS is wasted effort — the actual product differentiator is the betting/prediction layer, not tournament hosting.

**Already executed** (soft retirement, done — see commit for this change once committed): the internal tournament-creation/bracket-authority UI was hidden/removed from `src/pages/OrganizerPanelPage.jsx` and `src/pages/TournamentDetailPage.jsx`. Market-admin UI was extracted into `src/components/PredictionMarketAdminPanel.jsx`, independent of tournament creation. **Nothing at the database layer was touched**: all migrations (0008, 0010, 0011, 0012 rating trigger, 0013, 0015) remain in place untouched — the rating-projection trigger and the auto-resolve-markets trigger fire on writes to `results`/`tournaments` regardless of who/what writes there, so they survive this pivot unchanged; only the *writer* needs to become a start.gg-import path instead of the organizer UI. Two e2e specs (`e2e/tournament-flow.spec.js`) that exercised the retired flow are `test.skip`'d with explanatory comments, not deleted.

## Current State

- **Identity**: `src/auth/SessionProvider.jsx` + `src/repositories/sessionRepository.js` — Google OAuth via Supabase Auth; `auth.users.id` (uuid) is the identity primitive, with `profiles.username` and `user_roles` (organizer/referee/admin) attached. No wallet-address concept exists anywhere in the app or schema today.
- **Tournament authority**: `supabase/migrations/0011_result_rpc.sql` `submit_official_result(request_id, match_id, games_won_a, games_won_b)` is the sole authority for official results — organizer-of-tournament or referee/admin only, idempotent by `request_id`, atomic (records result, advances bracket, audits) in one `SECURITY DEFINER` transaction. This is a trusted, centralized-but-access-controlled, audited off-chain oracle-of-record.
- **Prior-art off-chain simulation** (already in `main`, added outside any SDD change — fake-money, `currency='USD'`):
  - `supabase/migrations/0016_create_wallet_ledger.sql` — `public.wallets` (balance/locked_balance) + `public.wallet_transactions`, fully custodial: Postgres directly owns and mutates a numeric balance via `deposit_funds`/`withdraw_funds` RPCs.
  - `supabase/migrations/0017_create_prediction_markets.sql` — `public.markets` / `market_outcomes` / `market_positions`; `create_prediction_market` (organizer/admin), `buy_market_shares` (debits wallet, upserts position, linear `price + shares*0.005` price bump — **not** a sound AMM, trivially pushable to the 0.95 cap), `resolve_market` (pays winners by directly crediting `wallets.balance`).
  - `supabase/migrations/0018_auto_resolve_prediction_markets.sql` — trigger on `tournaments.status -> COMPLETED` that finds the bracket winner and calls `resolve_market`. The trigger-on-authoritative-state-change *pattern* is reusable; the direct-wallet-credit resolution mechanism is not.
  - `supabase/migrations/0019_admin_role_management.sql` — admin role grant/revoke, orthogonal.
  - Frontend: `src/pages/{WalletPage,MarketDetailPage}.jsx`, `src/components/{LiveBetTicker,TournamentPredictionWidget,MarketCard,MarketPriceChart,MarketProbabilityBar,BuySharesPanel,PositionRow,PredictionWidget}.jsx`, `src/repositories/{wallet,market}Repository.js`, plus older pre-Supabase mock code `src/data/markets.js`, `src/lib/prediction.js`.
- **Stack**: React 19/Vite 8, `@supabase/supabase-js` only (`package.json`). Zero web3 dependencies (no wagmi/viem/ethers/RainbowKit/WalletConnect), no Solidity, no Foundry/Hardhat, no contracts directory anywhere in the repo.

## Affected Areas (net-new; nothing existing is modified by exploration itself)

- New on-chain contracts workspace (Solidity/Foundry) — market factory/escrow + oracle-adapter — entirely outside `src/`.
- New `src/lib/web3/*`-style wallet-connection layer (wagmi/viem + connector UI) and contract read/write hooks.
- `src/auth/SessionProvider.jsx` / `sessionRepository.js` will eventually need a wallet-linking concept — flagged as an open design question, not resolved or touched here.
- New Supabase event-indexer (Edge Function/cron) mirroring on-chain market/position/resolution events into Postgres for fast UI reads — shape-similar to `markets`/`market_outcomes` but a read cache, not source of truth.
- `0011_result_rpc.sql`'s authority chain becomes the upstream trigger for a relayer posting results on-chain — read-only dependency.
- Fate of 0016-0019 + WalletPage/MarketDetailPage (retire vs. keep as separate play-money feature) — explicit product decision for `sdd-propose`.

## Approaches (contract architecture)

1. **Full Gnosis CTF clone + custom CLOB** (reproduce Polymarket's full stack: ERC-1155 Conditional Tokens Framework + matching-engine order book + UMA Optimistic Oracle adapter)
   - Pros: Maximum composability, proven at Polymarket's scale.
   - Cons: A CLOB is itself a large off-chain infra project, not just a contract — effort far beyond a single-tournament-outcome betting product; largest audit surface; slowest to ship.
   - Effort: High.

2. **Fully custom bespoke escrow contract per market** (no CTF, minimal Solidity per market/factory, pari-mutuel or fixed-odds payout, custom oracle-adapter call)
   - Pros: Smallest, most auditable surface, matches the actual product need (binary/discrete tournament-outcome bets); cheapest gas; fastest to ship; pari-mutuel needs no market-maker pricing algorithm at all.
   - Cons: Positions aren't standard tradeable tokens (no secondary market without extra work); reinvents security properties CTF already has a long track record for; is exactly the "custom-from-scratch" pattern already flagged as risky for real-money code.
   - Effort: Medium.

3. **"CTF-lite" hybrid (recommended)** — call into Gnosis's already-deployed, already-audited `ConditionalTokens` singleton on Polygon mainnet purely for share issuance/redemption bookkeeping, and write only a thin custom oracle-adapter + simple pricing contract (pari-mutuel or basic CPMM, not a full CLOB) on top.
   - Pros: Inherits CTF's audited token-mechanics security "for free" (shared, live, audited contract); small custom-code audit surface (adapter + pricing only, comparable to Approach 2); positions remain standard ERC-1155 so future composability isn't foreclosed; matches the shape of Polymarket's own `Polymarket/uma-ctf-adapter` — a thin adapter on a shared CTF core.
   - Cons: Requires correctly understanding CTF's positionId/collectionId hashing (non-trivial but well-documented, with Polymarket's own adapter as public reference); ties mainnet deployment to a third-party contract's continued availability (mitigated: long-lived, widely used, already audited).
   - Effort: Medium.

## Resolution/oracle approaches (orthogonal, tightly coupled)

**Updated by the product redirect**: the oracle-of-record is no longer GG2's own `submit_official_result` RPC (that authority chain is retired at the UI level). It becomes **start.gg's own result data**, pulled by a new ingestion worker. The relayer/challenge-window shape below is unchanged in mechanism — only the upstream data source changes.

- **A. Centralized relayer using a start.gg-ingestion worker as sole on-chain oracle** — a scheduled job polls start.gg's GraphQL API (`sets`/`standings`, keyed by `completedAt`/`state`) for MX-filtered tournaments, writes into GG2's existing `results`/`matches` tables (reusing the rating-projection and auto-resolve triggers unchanged), then a relayer posts the outcome on-chain. Cheapest/fastest, but reintroduces a single point of trust (the relayer signing key + trust that the ingestion worker read start.gg correctly) exactly where non-custodial products remove one.
- **B. Full UMA-style Optimistic Oracle** (propose+bond, challenge window, dispute escalation) — Polymarket's actual mechanism, credibly neutral, but heavy integration lift/UX overhead redundant for the common honest case.
- **C. Recommended hybrid**: relayer posts the start.gg-sourced result immediately, behind a short permissionless challenge window where any wallet can dispute by staking a bond; disputes escalate to a designated multisig for MVP, with real UMA OO integration as a defined Phase 2. Adds an economic disincentive against a bad ingestion read or a compromised relayer without requiring full UMA integration on day one.

## start.gg API — key facts for design (researched 2026-08-15)

- **GraphQL** at `api.start.gg/gql/alpha` (still path-labeled "alpha" after years in public use — no changelog found, treat schema stability as unproven). Auth: bearer token from a developer profile, expires yearly; OAuth exists but isn't needed for public read-only tournament data.
- **Regional filter confirmed**: `tournaments(filter: { countryCode: "MX" })` — exactly what's needed for the Mexico-first scope.
- **No webhooks/subscriptions found** — result detection is polling-only, against `sets.state`/`sets.completedAt`. Realistic latency: seconds-to-tens-of-seconds, bounded by the rate limit below.
- **Rate limit**: ~80 requests/60s, max 1000 objects per request (per official docs) — start.gg's ToS also reserves the right to set stricter per-token limits at its sole discretion.

## Recommendation

Approach 3 (CTF-lite) + Resolution C (relayer-with-challenge-window over start.gg-sourced results, UMA as Phase 2). Keeps custom-audit surface comparable to a bespoke contract while inheriting CTF's proven security/composability, and phases decentralization-of-resolution instead of blocking MVP on full UMA integration.

## Net-new infra required

- **Solidity dev framework**: Foundry (2026 default for security/audit-focused work — Solidity-native fuzz tests, faster than Hardhat; teams commonly pair Foundry for contracts/tests with Hardhat/viem for deploy scripts if needed).
- **Testnet**: Polygon Amoy (chain id 80002) — confirmed still the current, actively maintained Polygon PoS testnet in 2026 (Mumbai deprecated).
- **Wallet-connection layer**: wagmi + viem (optionally RainbowKit/ConnectKit) — net-new dependency, nothing today.
- **RPC provider**: Alchemy or Infura for Amoy + Polygon mainnet.
- **Deployment/audit pipeline**: net-new CI (Foundry test+fuzz+Slither static analysis), a funded third-party audit before real-USDC mainnet deployment (non-negotiable), Polygonscan verification.
- **Supabase's continuing role**: not custody. It remains (a) source-of-truth for tournament/result state feeding the relayer, (b) an off-chain event-indexer/read-cache for UI, and (c) owner of GG2 account/profile/role identity — a separate primitive from wallet address (see open question).

## Open design question (flagged only, not resolved)

Wallet address (EOA/smart-account, no inherent link to a person) vs. GG2 profile (Google OAuth + username) are different identity primitives. For `sdd-propose`/`sdd-design`:

- Does placing an on-chain bet require an existing GG2 account, or can any connected wallet trade independently (Polymarket allows wallet-only)?
- If linking is desired, is it 1:1 SIWE-verified ownership, or must a user support multiple wallets?
- Sanction/address screening almost certainly binds to the wallet address (the actual on-chain actor), independent of whether a GG2 account exists.

## Risks

- **NEW, first-order — start.gg API Terms of Service conflict** (`start.gg/about/apitos`, fetched 2026-08-15): (a) §13 explicitly forbids redistributing/reselling start.gg data or any service built on it; (b) §14's "no illegal use" clause names gambling alongside piracy as an example of prohibited use — not a blanket ban, but a clear signal of hostile intent toward wagering products; (c) §9.1 lets start.gg suspend/terminate API access "in our sole discretion at any time, for any reason," with **no notice required**; (d) their liability cap for anything going wrong on their end is USD $5. This is a *business-continuity/contractual* risk to the whole external-data architecture, distinct from and orthogonal to the maintainer-owned gambling-legality question — it means the entire product could lose its tournament-data source unilaterally and without warning. Their ToS itself invites high-volume/commercial use cases to contact `hello@start.gg` for a partnership (§2.2.5).
  - **Maintainer decision (2026-08-15)**: accepted as-is, no mitigation. No partnership outreach, no fallback/alternate ingestion path. If start.gg revokes API access, the product's tournament-data source goes down with it — explicitly acceptable to the maintainer. `sdd-propose`/`sdd-design` should NOT scope a fallback ingestion path or a start.gg outreach step unless asked again.
- Frontend-only IP geoblocking is not established as sufficient for a permissionless smart contract (Polymarket precedent: FBI/DOJ action Jan 2025 despite geoblocking + non-custodial design). Real OFAC exposure is per-wallet-address (SDN list). A technical mitigation exists independent of the (maintainer-owned, out-of-scope) legal question: an on-chain sanctions check (e.g., Chainalysis's free, publicly deployed on-chain sanctions oracle contract, callable from within the settlement/trade contract) is architecturally stronger than IP-only geoblocking and should be evaluated in design — not treated as a substitute for the maintainer's own legal compliance work.
- Real USDC custody-adjacent code needs a funded professional audit before mainnet deployment regardless of framework choice — budget/schedule for it explicitly.
- The centralized-relayer fast path (Approach A/C) reintroduces a single point of trust (relayer key + organizer/referee integrity) — must be explicitly scoped as an accepted MVP trust assumption, not silently framed as "fully non-custodial resolution."
- The existing simulated `buy_market_shares` linear pricing formula is unsound and must not be ported as a reference for on-chain pricing logic.
- Retiring vs. keeping the existing simulated wallet/market feature alongside the new on-chain product is an unresolved product/UX decision (naming collisions: two "wallet" concepts, two "market" concepts) that `sdd-propose` should settle explicitly.

## Explicit boundaries honored in this exploration

- Gambling licensing, KYC/AML, and jurisdiction-specific legality were intentionally NOT investigated — maintainer-owned and explicitly out of scope for this change.
- No contract code, migrations, or app code was written — exploration only.
- The existing `production-ready-tournament-betting-platform` change was read for context only; nothing in it was modified.

## Ready for Proposal

Yes — architecture direction (CTF-lite + phased relayer/UMA resolution) is clear enough to scope a proposal. The identity-linking model and the fate of the existing simulated wallet/market feature are open questions for `sdd-propose`/`sdd-design` to settle, not blockers to starting.

---

**Status**: done
**Next recommended**: sdd-propose
