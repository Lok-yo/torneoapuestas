# Delta for start.gg Tournament Ingestion

## ADDED Requirements

### Requirement: MX-Filtered Polling

The system MUST poll the start.gg GraphQL API (`api.start.gg/gql/alpha`) using `tournaments(filter: { countryCode: "MX" })` and MUST NOT ingest tournaments outside this filter.

#### Scenario: Non-MX tournament excluded

- GIVEN a start.gg tournament with `countryCode` other than `"MX"`
- WHEN the polling worker runs
- THEN that tournament is not written into `results`/`matches`

### Requirement: Rate Limit Budget Across Market Types

The system MUST stay within start.gg's ~80 requests/60s limit while polling for both per-match markets (`sets.state`/`sets.completedAt`) and per-tournament-winner markets (`standings`) across all active MX tournaments simultaneously. The system MUST prioritize or batch requests so that neither market type is starved when the combined request volume approaches the ceiling.

#### Scenario: Combined polling stays under rate limit

- GIVEN N active MX tournaments each requiring both a per-match and a per-tournament-winner poll in one cycle
- WHEN the worker executes one polling cycle
- THEN total requests issued in that cycle do not exceed the ~80/60s budget, with requests scheduled/batched across both market types

#### Scenario: Rate limit response handled without data loss

- GIVEN the worker receives a rate-limit error from start.gg mid-cycle
- WHEN the error is returned
- THEN the worker backs off and resumes remaining polls in a subsequent cycle without dropping unprocessed tournaments

### Requirement: Result Write into Existing Schema

The system MUST write ingested match and standings data into the existing `results`/`matches` tables using the current schema, so the existing rating-projection and auto-resolve-markets triggers fire unchanged.

#### Scenario: Ingested result triggers existing downstream effects

- GIVEN a start.gg set reaches `state: COMPLETED`
- WHEN the worker writes the corresponding row into `results`/`matches`
- THEN the existing rating-projection trigger and auto-resolve trigger fire exactly as they would for any other write to those tables
