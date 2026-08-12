# Tournament Operations Specification

## Purpose

Provide one persisted game/format with authorized tournament operations, deterministic competition state, and public non-financial projections.

## Requirements

### Requirement: Validated tournament lifecycle

The platform MUST persist a tournament lifecycle for the supported game and format. Each transition MUST be server-authorized, auditable, and rejected when it is not valid for the current state; unsupported games or formats MUST NOT be silently accepted.

#### Scenario: Valid organizer transition

- GIVEN an authorized organizer owns a draft tournament with valid configuration
- WHEN the organizer opens registration or advances the lifecycle
- THEN the state changes once and the transition is audited

#### Scenario: Invalid or unauthorized transition

- GIVEN a tournament is in a state that does not permit the requested transition, or the caller lacks organizer authority
- WHEN the transition is submitted
- THEN it is rejected without changing state

### Requirement: Registration and roster freeze

The platform MUST enforce eligibility, membership uniqueness, withdrawal rules, and a configured roster freeze. Registration commands MUST be safe under retries and concurrent submissions.

#### Scenario: Eligible registration

- GIVEN registration is open and a user is eligible
- WHEN the user registers
- THEN one membership is created and the roster projection updates

#### Scenario: Duplicate or frozen registration

- GIVEN the user is already registered or the roster is frozen
- WHEN registration or withdrawal is submitted
- THEN a stable conflict is returned and the roster remains unchanged

### Requirement: Bracket and match invariants

Bracket generation MUST assign eligible participants to matches belonging to exactly one tournament stage and MUST NOT invent winners or overwrite an existing bracket. Repeated or concurrent generation MUST produce one equivalent bracket.

#### Scenario: Bracket generation

- GIVEN registration is closed, the roster is valid, and no bracket exists
- WHEN an authorized organizer generates the bracket
- THEN match dependencies and slots are persisted without fabricated results

#### Scenario: Retry or invalid generation

- GIVEN a bracket already exists, the roster is incomplete, or a dependency is unavailable
- WHEN generation is attempted
- THEN the existing bracket is preserved or a stable error is returned, with no partial bracket

### Requirement: Official result authority

Only an explicitly authorized organizer or referee MAY submit an official result for a valid match state. Results MUST retain score/ruleset evidence, be idempotent, and require an audited correction path rather than silent overwrite.

#### Scenario: Accepted official result

- GIVEN a match is completable and the caller has result authority
- WHEN a valid result is submitted
- THEN one official result advances the bracket once and emits an audit event

#### Scenario: Unauthorized, stale, or repeated result

- GIVEN the caller lacks authority, the match is not completable, or the result request is retried
- WHEN the result is submitted
- THEN it is denied, rejected as invalid, or returns the original outcome without duplicate advancement

### Requirement: Public projection and closed perimeter

Published tournament, bracket, match, and result projections MUST be readable without exposing private data. Stage 1 MUST NOT expose betting, crypto, market settlement, or monetized prediction actions.

#### Scenario: Public published view

- GIVEN a tournament is published and its dependency data is available
- WHEN a public reader requests the view
- THEN the latest persisted projection is returned with no private participant data

#### Scenario: Projection dependency outage

- GIVEN a projection dependency or delivery channel is unavailable
- WHEN a public reader requests the view
- THEN the platform returns a truthful unavailable/stale state and never fabricates competition or financial data
