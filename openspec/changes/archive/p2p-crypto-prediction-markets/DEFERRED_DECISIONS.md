# Deferred Decisions (non-blocking, maintainer-owned)

Per design.md "Open Questions" and tasks.md Phase 14 — recorded here as a
standalone note so it survives independently of design.md edits. These
items are explicitly **not** implementation tasks for this change; they
gate a future mainnet-deploy change, not this Amoy-testnet one.

## Mainnet bond/liquidity calibration

`MarketFactory`/`ResolutionAdapter`'s bond and liquidity constants
(`CREATION_BOND` 25 USDC, `CHALLENGER_BOND` 25 USDC, `MIN_LIQUIDITY` 100
USDC, `DISPUTE_BOND` 100 USDC, relayer stake 1000 USDC) are
**testnet-calibrated placeholders** per design.md's Parameters table.
Mainnet calibration is a funding/risk decision the maintainer owns —
real-value bonds must be large enough to deter spam/abuse without
pricing out legitimate creators/challengers, which requires live
market-data judgment this change does not attempt to make. All amounts
are owner-settable constants on the deployed contracts, not hardcoded
immutables, specifically so this recalibration never requires a
redeploy.

## Multisig composition

The MVP arbitration multisig's signer set (m-of-n, signer identities,
operational SLA versus the 4-hour result-dispute / 7-day creation-ruling
timeouts) is entirely maintainer-owned. This change wires
`onlyMultisig`-gated functions (`MarketFactory.ruleCreation`,
`ResolutionAdapter.rule`) against a single `multisig` address parameter,
settable via `setMultisig()`, so the actual signer-set decision can be
made independently of (and after) this change merges. No implementation
task in this change depends on knowing the real signer set — Amoy
testing runs `multisig` as a single EOA a maintainer or test script
controls.

## Not gating this change

Neither item blocks `sdd-tasks`/`sdd-apply`/`sdd-verify` for
`p2p-crypto-prediction-markets`, and neither is a code change — both are
tracked here purely so they are not lost before a future mainnet-deploy
change proposal.
