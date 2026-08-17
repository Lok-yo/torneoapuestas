# Delta for Oracle Resolution

## ADDED Requirements

### Requirement: Relayer Result Posting

The system MUST allow a designated relayer to post a start.gg-sourced match or tournament-winner result on-chain for a resolvable market, referencing the ingested `results`/`matches` record it derives from.

#### Scenario: Relayer posts a result

- GIVEN a match or tournament in the ingestion cache has a final start.gg result
- WHEN the relayer submits the result on-chain for the corresponding market
- THEN the market enters a PROPOSED-RESULT state with the posted outcome and a start timestamp for the challenge window

### Requirement: Permissionless Challenge Window

The system MUST open a fixed-duration challenge window after a relayer posts a result, during which any wallet MAY dispute the posted outcome. The system MUST NOT allow final settlement before the window elapses.

#### Scenario: Result finalizes unchallenged

- GIVEN a posted result with no dispute filed
- WHEN the challenge window elapses
- THEN the market settles using the relayer-posted outcome

#### Scenario: Settlement blocked mid-window

- GIVEN a posted result still inside its challenge window
- WHEN any party attempts to trigger settlement
- THEN the settlement call reverts

### Requirement: Bond-Staked Dispute

The system MUST require a wallet disputing a posted result to lock a USDC bond. The system MUST forward disputed markets to multisig arbitration and MUST NOT allow relayer self-dispute of its own posting.

#### Scenario: Dispute filed with bond

- GIVEN a posted result inside its challenge window
- WHEN a wallet other than the relayer locks the required bond and files a dispute
- THEN the market moves to DISPUTED state and awaits multisig arbitration

### Requirement: Multisig Arbitration (MVP)

The system MUST resolve disputed markets via a designated multisig signer set for this MVP, whose ruling MUST be final on-chain, with real UMA Optimistic Oracle integration deferred to a later phase. On a ruling confirming the relayer's posted result, the system MUST return the disputer's bond to the relayer/protocol. On a ruling against the posted result, the system MUST slash the relayer-side stake (if any) and refund the disputer's bond plus reward, and settle using the multisig-determined outcome.

#### Scenario: Multisig upholds relayer result

- GIVEN a disputed market awaiting arbitration
- WHEN the multisig confirms the original relayer-posted outcome
- THEN the market settles on that outcome and the disputer's bond is forfeited

#### Scenario: Multisig overturns relayer result

- GIVEN a disputed market awaiting arbitration
- WHEN the multisig rules a different outcome than the relayer posted
- THEN the market settles on the multisig-determined outcome and the disputer's bond is refunded with a reward
