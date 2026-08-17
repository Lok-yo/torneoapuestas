# Rating Projections Specification

## Purpose

Derive auditable ratings, leaderboards, player history, and clearly bounded read-only projections from official tournament results.

## Requirements

### Requirement: Official-result rating events

Ratings MUST change only from accepted official results. Each scoring event and snapshot MUST identify the ruleset/version, source result, participants, and effective time; unapproved or simulated outcomes MUST NOT affect ratings.

#### Scenario: Official result produces a rating event

- GIVEN an official result is accepted for the supported game and ruleset
- WHEN rating processing completes
- THEN a versioned event and resulting snapshots are linked to that result

#### Scenario: Unofficial or invalid input

- GIVEN a non-authoritative forecast, fixture simulation, draft result, or invalid result is submitted
- WHEN rating processing is requested
- THEN no rating event or leaderboard change is created

### Requirement: Deterministic and retry-safe processing

Rating processing MUST be deterministic for the same event history and MUST be idempotent under retries or concurrent workers. Conflicting source versions MUST stop processing for review rather than silently choosing one.

#### Scenario: Repeated processing

- GIVEN the same official result is delivered more than once
- WHEN rating processing runs concurrently or is retried
- THEN one equivalent event is retained and no duplicate rating change occurs

#### Scenario: Conflicting history

- GIVEN two incompatible official-result versions are presented
- WHEN recomputation is requested
- THEN the projection is marked for review and existing evidence is preserved

### Requirement: Correction and historical auditability

Corrections MUST append an authorized adjustment or replacement event with reason and actor; they MUST NOT erase prior ratings, leaderboard states, or source evidence. History MUST be recomputable from retained events.

#### Scenario: Authorized correction

- GIVEN an authorized correction references an existing official result
- WHEN the correction is approved
- THEN a new version is recorded, projections recompute deterministically, and the prior state remains auditable

#### Scenario: Unauthorized correction

- GIVEN a caller lacks correction authority or omits a reason
- WHEN a correction is submitted
- THEN it is rejected and no projection changes

### Requirement: Public leaderboard and privacy boundary

Public leaderboard and player-history projections MUST expose only approved competitive fields and their freshness/version. Private identity fields MUST remain protected, and unavailable source data MUST produce a truthful unavailable state.

#### Scenario: Published leaderboard

- GIVEN valid rating snapshots exist
- WHEN a public reader requests the leaderboard
- THEN a consistently versioned projection and player history are returned without private identity data

#### Scenario: Rating dependency unavailable

- GIVEN rating data is stale, incomplete, or unavailable
- WHEN a projection is requested
- THEN the response identifies the limitation and does not present fabricated or silently stale ratings as current
