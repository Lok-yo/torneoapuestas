# Proposal: Non-custodial P2P crypto prediction markets on start.gg-sourced tournaments

## Intent

GG2 stops being the tournament authority — start.gg already owns that for the MX scene. The differentiator is the betting layer. Today's market feature is fake money, custodial (Postgres owns balances), and priced by an unsound linear formula, so it cannot become a product. Deliver real-USDC, non-custodial prediction markets on Polygon over start.gg-ingested MX tournaments.

## Scope

### In Scope
- Foundry workspace: thin oracle-adapter + pricing contract over the deployed Gnosis `ConditionalTokens` singleton ("CTF-lite"), USDC collateral.
- Resolution: relayer posts start.gg result, permissionless challenge window, bond-stake dispute, multisig arbitration for MVP.
- start.gg polling worker (`filter: { countryCode: "MX" }`) writing into existing `results`/`matches`; rating and auto-resolve triggers fire unchanged.
- wagmi/viem wallet layer + contract hooks, on-chain sanctions-oracle check at trade/settle, maintainer-required IP geoblocking.
- Off-chain event indexer mirroring on-chain state into Postgres as a read cache, not source of truth.
- Amoy testnet deploy, Foundry/Slither CI.

### Out of Scope
- Gambling licensing, KYC/AML, jurisdictional legality — maintainer-owned.
- Full UMA Optimistic Oracle (Phase 2), CLOB, secondary-market UX.
- start.gg fallback ingestion or partnership outreach — risk accepted as-is.
- Reviving the retired tournament-creation UI.
- Mainnet deployment (audit-gated, separate change).

## Capabilities

### New Capabilities
- `onchain-prediction-markets`: market creation, share issuance/redemption, USDC escrow, pricing.
- `oracle-resolution`: relayer posting, challenge window, bond dispute, multisig arbitration.
- `startgg-tournament-ingestion`: MX-filtered polling into the existing tournament/result schema.
- `wallet-identity`: wallet connection, optional GG2 profile link, sanctions/geo gating.

### Modified Capabilities
- None. `openspec/specs/` holds no merged specs yet.

## Approach

Exploration Approach 3 + Resolution C: inherit audited CTF token mechanics, keep the custom-audit surface to adapter + pricing only (mirrors `Polymarket/uma-ctf-adapter`). Supabase keeps identity, ingestion, and read-cache duties — never custody. Resolution decentralization is phased, not a launch blocker.

**Decision — identity (confirmed by maintainer, 2026-08-15)**: any connected wallet MAY trade without a GG2 account; GG2 linking is optional 1:1 SIWE for social surfaces only. Sanctions screening binds to the address regardless.

**Decision — legacy play-money (confirmed by maintainer, 2026-08-15)**: soft-retire the simulated wallet/market UI (hidden, not deleted); migrations 0016–0019 stay untouched. Frees the "wallet"/"market" names for the on-chain product.

**Decision — market granularity (confirmed by maintainer, 2026-08-15)**: both per-match and per-tournament-winner markets are in scope. This is the highest-polling-load option — the start.gg ingestion worker must budget its ~80 req/60s ceiling across both market types per active MX tournament; `sdd-design` must size the polling schedule accordingly.

**Decision — market creation (confirmed by maintainer, 2026-08-15)**: permissionless. Any wallet may create a market on any ingested start.gg event — no admin approval gate, a deliberate departure from the current `PredictionMarketAdminPanel`-only posture. This trades quality control for scale and introduces a new day-one risk (spam/malformed/duplicate markets) that has no mitigation defined yet — `sdd-spec`/`sdd-design` MUST define guardrails (e.g., a creation bond, per-event/per-wallet rate limits, or duplicate-market detection against the same start.gg event+outcome) rather than shipping creation fully unbounded.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `contracts/` | New | Foundry adapter + pricing |
| `src/lib/web3/` | New | wagmi/viem client, connector, hooks |
| `src/pages/{WalletPage,MarketDetailPage}.jsx` | Modified | Repointed on-chain or soft-retired |
| `src/components/PredictionMarketAdminPanel.jsx` | Modified | Admin over on-chain markets |
| `src/auth/SessionProvider.jsx` | Modified | Optional wallet link |
| `supabase/functions/` | New | start.gg poller + event indexer |
| `supabase/migrations/` | New | Wallet-link + cache tables (additive) |
| `.github/workflows/` | Modified | Foundry fuzz + Slither gate |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| start.gg revokes API access, no notice | Med | Accepted by maintainer — no fallback |
| Relayer key compromise / bad ingestion read | Med | Challenge window + bond + multisig; documented MVP trust assumption |
| Contract bug drains real USDC | Low/High-impact | Amoy-only until funded audit; fuzz + Slither in CI |
| CTF positionId/collectionId hashing errors | Med | Amoy tests against live CTF; Polymarket adapter as reference |
| Two "wallet"/"market" concepts confuse users | High | Soft-retire play-money UI |
| Geoblocking insufficient for a permissionless contract | High | On-chain sanctions oracle; legality maintainer-owned |
| Permissionless market creation → spam/malformed/duplicate markets | High | Unmitigated as of this proposal — `sdd-spec`/`sdd-design` must define a creation guardrail (bond, rate limit, or duplicate detection) |

## Rollback Plan

- Contracts are additive and testnet-only; abandoning means not deploying to mainnet — no user funds at risk.
- Web3 frontend ships behind a feature flag; disabling restores the current app.
- Legacy soft-retirement is UI-only and revertible by unhiding; 0016–0019 stay intact.
- New migrations are additive (no drops), so rollback needs no data recovery.
- Ingestion worker is a separate deployable; stopping it leaves tournament state untouched.

## Dependencies

- start.gg developer API token (yearly expiry); ~80 req/60s limit.
- Alchemy/Infura RPC for Amoy and Polygon mainnet.
- Gnosis `ConditionalTokens` singleton on Polygon (third-party, deployed).
- Funded third-party audit — hard gate for mainnet, not for this change.
- Multisig signer set for MVP arbitration.
- Shares GG2's repo/auth foundation with `production-ready-tournament-betting-platform`, but is independent of it.

## Success Criteria

- [ ] A start.gg MX tournament is ingested end-to-end and becomes a tradeable Amoy market.
- [ ] A wallet buys, holds, and redeems positions in USDC with no custodial balance touched.
- [ ] A bonded dispute escalates to multisig and settlement follows the arbitrated result.
- [ ] Foundry test + fuzz and Slither pass in CI on every contract change.
- [ ] A sanctioned address is rejected at trade time.
- [ ] Exactly one "wallet" and one "market" concept is reachable in the UI.
- [ ] Any wallet can permissionlessly create a per-match or per-tournament-winner market on an ingested start.gg event, subject to a defined anti-spam guardrail.
- [ ] `npm run lint` and `npm run build` pass.
