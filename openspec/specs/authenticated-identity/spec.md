# Authenticated Identity Specification

## Purpose

Provide provider-backed identity, private profiles, and safe username onboarding for Stage 1.

## Requirements

### Requirement: Google authentication and session lifecycle

The platform MUST authenticate users through the configured Google identity flow and MUST keep provider secrets server-side. Session bootstrap, refresh, expiry, and sign-out MUST have explicit states and MUST prevent protected commands after revocation.

#### Scenario: Successful sign-in

- GIVEN a user completes the configured Google flow
- WHEN the session is established
- THEN the user is authenticated, the profile is loaded or created, and protected views become available

#### Scenario: Provider or session failure

- GIVEN Google, the identity service, or session refresh is unavailable or expired
- WHEN the user bootstraps or uses a protected view
- THEN the platform reports a recoverable authentication state and denies protected commands

### Requirement: Private profile with public allowlist

An authenticated identity MUST map to one profile keyed by the provider identity. The platform MUST expose only an explicit public profile allowlist and MUST NOT collect KYC, financial, geolocation, or unrelated behavioral data in Stage 1.

#### Scenario: Profile boundary

- GIVEN an authenticated user has a profile and public username
- WHEN the user or another reader requests profile data
- THEN the owner can access permitted private fields while public readers receive only the allowlisted projection

#### Scenario: Cross-account disclosure attempt

- GIVEN a caller requests another user's private profile fields
- WHEN authorization is evaluated
- THEN access is denied without revealing whether protected fields exist

### Requirement: Atomic case-insensitive username claim

Username input MUST be normalized and validated at the command boundary. A claim MUST be atomically unique without regard to case, and retries MUST be idempotent for the same identity and username.

#### Scenario: Valid claim

- GIVEN an authenticated user submits an available valid username
- WHEN the claim is committed
- THEN exactly one profile owns the normalized username and the result is auditable

#### Scenario: Collision or concurrent claim

- GIVEN two users claim names differing only by case, or the request is retried concurrently
- WHEN both commands are processed
- THEN one claim succeeds, the other receives a stable conflict, and no duplicate ownership is created

### Requirement: Identity authorization and abuse controls

Every protected command MUST require an active authenticated identity and the specific role or ownership permission. Authentication endpoints and username claims SHOULD be rate-limited, and authorization failures MUST be auditable without exposing tokens.

#### Scenario: Unauthorized command

- GIVEN an unauthenticated user or a user without the required role
- WHEN the user submits a protected identity or account command
- THEN the command is rejected with the standard authorization error

#### Scenario: Repeated abuse

- GIVEN repeated failed sign-ins or username claims from one actor
- WHEN the configured threshold is exceeded
- THEN further attempts are throttled and the security event is observable

### Requirement: Non-financial identity boundary

Identity onboarding MUST NOT create wallet balances, custody accounts, market positions, deposits, withdrawals, or monetized predictions as a side effect.

#### Scenario: Onboarding completion

- GIVEN a user completes Google sign-in and username onboarding
- WHEN the profile is finalized
- THEN only identity/profile state is created and no financial or market state exists
