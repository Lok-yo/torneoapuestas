# Delta for Onchain Prediction Markets

## ADDED Requirements

### Requirement: Permissionless Market Creation Guardrail (Creation Bond)

The system MUST require any wallet creating a new market to lock a refundable USDC creation bond. The system MUST allow any other wallet to challenge a newly created market as duplicate (same start.gg event ID + outcome type as an existing active market) or malformed (references a non-existent, unresolvable, or ambiguous outcome) within a fixed challenge window. The system MUST route a confirmed challenge through the same multisig arbitration used for outcome disputes (see `oracle-resolution`). On a confirmed challenge, the system MUST slash the creator's bond, pay a portion to the challenger, and void the market before it becomes tradeable. On an unchallenged window, the system MUST refund the bond in full and activate the market.

#### Scenario: Legitimate market created and bond refunded

- GIVEN a wallet holds at least the required USDC bond and identifies an ingested start.gg event ID with an outcome not already covered by an active market
- WHEN the wallet calls the market-creation function with the bond
- THEN the market is instantiated in PENDING state and the bond is locked
- AND WHEN the challenge window elapses with no valid challenge THEN the market transitions to ACTIVE and the bond is refunded to the creator

#### Scenario: Duplicate/malformed market challenged and bond slashed

- GIVEN a wallet creates a market duplicating an existing active market's start.gg event ID + outcome type, or referencing a malformed outcome
- WHEN another wallet submits a challenge with its own bond inside the challenge window
- THEN the dispute is escalated to multisig arbitration
- AND WHEN the multisig confirms the market is duplicate or malformed THEN the creator's bond is slashed, a portion is paid to the challenger, and the market never activates

### Requirement: Permissionless Market Creation Eligibility

The system MUST allow any wallet to create a market for any ingested start.gg event without admin approval, subject to the creation-bond guardrail. The system MUST support both per-match and per-tournament-winner market types. The system MUST reject creation attempts referencing a start.gg event ID not present in the ingestion cache.

#### Scenario: Creation rejected for unknown event

- GIVEN a start.gg event ID that has not been ingested
- WHEN a wallet attempts to create a market against that ID
- THEN the transaction reverts before any bond is locked

### Requirement: Share Issuance via CTF-lite

The system MUST issue outcome shares as ERC-1155 positions through calls into the deployed Gnosis `ConditionalTokens` singleton, computed via the correct positionId/collectionId hashing for the market's condition. The system MUST NOT implement custom token-balance bookkeeping outside CTF.

#### Scenario: Wallet buys outcome shares

- GIVEN an ACTIVE market with two outcomes
- WHEN a wallet deposits USDC collateral and requests shares of one outcome
- THEN CTF mints the corresponding ERC-1155 position to the wallet, sized per the pricing function

### Requirement: Share Redemption via CTF-lite

The system MUST allow a wallet holding winning-outcome shares to redeem them for USDC collateral via CTF's payout mechanism once the market condition is resolved, and MUST make losing-outcome shares worthless with no separate payout path.

#### Scenario: Redemption after resolution

- GIVEN a market resolved with outcome A as winner and a wallet holding outcome-A shares
- WHEN the wallet calls redeem
- THEN CTF pays out USDC collateral proportional to the wallet's outcome-A share balance

### Requirement: USDC Escrow

The system MUST hold all collateral for open positions in the CTF/adapter contracts and MUST NOT allow any off-chain party (including Supabase) to move or custody trading collateral.

#### Scenario: Collateral remains on-chain

- GIVEN a wallet has an open position in a market
- WHEN the Supabase read-cache indexer is queried for that position
- THEN it returns a mirrored view only, with no ability to move the underlying USDC

### Requirement: Pricing

The system MUST price outcome shares using a bounded automated market-making function (CPMM or pari-mutuel) that cannot be trivially pushed to price extremes by a single small trade, replacing the prior unsound linear `price + shares*0.005` formula.

#### Scenario: Price moves with trade size, bounded

- GIVEN a market at price 0.50 for outcome A
- WHEN a wallet buys a small quantity of outcome-A shares
- THEN the resulting price shift is proportional to trade size relative to pool depth and never exceeds the configured price bounds in a single trade
