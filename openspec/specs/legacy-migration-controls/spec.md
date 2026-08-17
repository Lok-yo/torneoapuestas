# Legacy Migration Controls Specification

## Purpose

Retire mock data and localStorage-backed behavior incrementally while preserving a verified rollback path and a strict production source-of-truth boundary.

## Requirements

### Requirement: Explicit source-of-truth boundary

Production consumers MUST read authoritative persisted projections through defined adapters. Mock data MAY remain only behind an explicit demo/test boundary and MUST NOT silently become a production fallback.

#### Scenario: Authoritative read

- GIVEN the production flag is enabled and the persisted dependency is available
- WHEN a consumer requests tournament, identity, rating, or player data
- THEN the adapter returns authoritative data and records its source

#### Scenario: Authoritative dependency outage

- GIVEN the persisted dependency is unavailable
- WHEN a production consumer requests data
- THEN it returns a truthful unavailable/degraded state rather than silently serving fixtures

### Requirement: Staged, environment-scoped rollout

Migration flags MUST be explicit, environment-scoped, observable, and reversible. A flag change MUST NOT bypass authentication, authorization, lifecycle, audit, or data-validation requirements.

#### Scenario: Controlled rollout

- GIVEN an adapter has passed verification in staging
- WHEN its flag is enabled for production
- THEN only the declared consumers use it and the rollout is observable

#### Scenario: Emergency disablement

- GIVEN the adapter causes an integrity or availability incident
- WHEN an authorized operator disables its flag
- THEN traffic returns to the declared safe path without deleting authoritative data or audit evidence

### Requirement: Expand, verify, and retire safely

Legacy modules MUST NOT be deleted until usage inventory shows zero production consumers, replacement behavior is verified, and rollback evidence exists. Migration steps MUST be retry-safe and MUST preserve backward-compatible reads during transition.

#### Scenario: Retirement gate

- GIVEN all consumers use the replacement and verification evidence is complete
- WHEN retirement is approved
- THEN the legacy module can be removed without changing authoritative records

#### Scenario: Incomplete migration

- GIVEN a consumer, fixture, or verification gate remains unresolved
- WHEN retirement is attempted
- THEN deletion is blocked and the current rollback path remains available

### Requirement: Legacy identity and financial isolation

The localStorage session, mock player identity, simulated wallet, market, and prediction modules MUST NOT be promoted as production truth. No migration MAY create custody, balances, positions, deposits, withdrawals, settlement, KYC, or monetized prediction state.

#### Scenario: Identity migration

- GIVEN a user has legacy local session data and signs in through the authoritative identity flow
- WHEN the migration adapter runs
- THEN it links only verified profile data and ignores fabricated credentials or unverified private fields

#### Scenario: Simulated financial state

- GIVEN legacy wallet or market state exists in a browser
- WHEN production migration is executed
- THEN that state is isolated or discarded according to the declared policy and no financial record is created

### Requirement: Migration audit and rollback evidence

Every migration, flag change, adapter error, rollback, and data-reconciliation decision MUST be attributable, timestamped, and retained. Rollback MUST restore the last verified behavior without erasing newer audit records.

#### Scenario: Retry or concurrent migration

- GIVEN the same migration is started twice or retried after interruption
- WHEN the migration coordinator resumes
- THEN each record is migrated at most once and the final state is reconciled and auditable

#### Scenario: Reversible failure

- GIVEN verification detects corruption or an unavailable replacement dependency
- WHEN rollback is invoked
- THEN the safe prior path is restored, the failure is surfaced, and no unsupported financial or competition state is inferred
