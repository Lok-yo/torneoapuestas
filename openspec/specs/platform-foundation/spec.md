# Platform Foundation Specification

## Purpose

Provide the secure, observable, reproducible foundation for the Stage 1 non-financial tournament platform.

## Requirements

### Requirement: Environment and migration integrity

The Supabase-backed platform MUST keep development, staging, and production data and credentials isolated. Committed migrations MUST replay deterministically, and CI MUST block promotion when lint, build, migration, or authorization checks fail.

#### Scenario: Reproducible environment promotion

- GIVEN a clean target environment and the committed migration set
- WHEN the migration and quality gates run
- THEN the schema is reproducible and promotion is allowed only if every gate passes

#### Scenario: Dependency or migration failure

- GIVEN a migration, CI dependency, or deployment service is unavailable
- WHEN promotion is attempted
- THEN promotion stops without partial publication and the failure is observable

### Requirement: Validated commands and structured errors

All external input MUST be validated at the boundary. Commands MUST be retry-safe where they change authoritative state and MUST return one structured, machine-readable error shape without internal details.

#### Scenario: Valid command

- GIVEN an authenticated caller submits valid, authorized command data
- WHEN the command is processed
- THEN the authoritative outcome and a stable success response are returned

#### Scenario: Invalid or repeated command

- GIVEN malformed data or a previously completed request identifier
- WHEN the command is submitted
- THEN validation or the original outcome is returned without a duplicate state change

### Requirement: Least-privilege data access

Every exposed persisted relation MUST enforce row-level authorization. Public reads MUST expose only intentionally published fields; private identity, operational, and audit data MUST NOT be disclosed to other users or ordinary clients.

#### Scenario: Authorized public read

- GIVEN a published tournament projection
- WHEN an unauthenticated reader requests it
- THEN only its public fields are returned

#### Scenario: Forbidden access

- GIVEN a caller lacks ownership or the required role
- WHEN the caller reads or mutates protected data
- THEN the request is denied and no protected data or mutation is revealed

### Requirement: Audit and operational evidence

Security-sensitive, authorization, lifecycle, result, migration, and rollback actions MUST record actor, request identity, outcome, and time in an append-only audit trail. Structured logs, metrics, and alerts MUST omit secrets and support incident diagnosis.

#### Scenario: Audited authoritative action

- GIVEN an authorized result or role-sensitive command succeeds
- WHEN the transaction completes
- THEN its audit event and operational evidence identify the action and outcome

#### Scenario: Failed or suspicious action

- GIVEN an authorization failure, retry conflict, or dependency outage
- WHEN the event is handled
- THEN it is recorded and alerted as appropriate without exposing credentials or sensitive payloads

### Requirement: Stage 1 non-financial perimeter

Stage 1 MUST NOT create or expose cryptocurrency, wallets, deposits, withdrawals, trading, settlement, custody, KYC collection, or monetized prediction claims. Any retained demo balance or market fixture MUST remain explicitly non-production and isolated.

#### Scenario: Financial command boundary

- GIVEN a client attempts a wallet, market, settlement, or money-moving command
- WHEN the request reaches the platform boundary
- THEN it is unavailable or rejected and no financial state is created
