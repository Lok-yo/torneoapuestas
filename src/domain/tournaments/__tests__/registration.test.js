// RED (then GREEN against src/domain/tournaments/registration.js): proves
// eligibility, membership uniqueness, roster-freeze enforcement, and
// pre-freeze withdrawal rules. See tasks.md 3.4 and tournament-operations
// spec "Registration and roster freeze". This is the client-testable
// mirror of the same rules register_participant/withdraw_participant
// (0009_registration_rpc.sql) enforce server-side as the real authority.
import { describe, it, expect } from 'vitest'
import { assertRegistrationAllowed, assertWithdrawalAllowed, RegistrationError } from '../registration.js'

const openTournament = { status: 'REGISTRATION_OPEN', rosterFrozenAt: null }
const closedTournament = { status: 'REGISTRATION_CLOSED', rosterFrozenAt: '2026-01-01T00:00:00Z' }
const draftTournament = { status: 'DRAFT', rosterFrozenAt: null }

describe('registration eligibility', () => {
  it('allows registration when open and the user has no existing membership', () => {
    expect(() => assertRegistrationAllowed({ tournament: openTournament, existingMembership: null })).not.toThrow()
  })

  it('rejects registration when the user already has an active membership', () => {
    expect(() =>
      assertRegistrationAllowed({
        tournament: openTournament,
        existingMembership: { status: 'REGISTERED' },
      }),
    ).toThrow(RegistrationError)
  })

  it('allows re-registration after a prior withdrawal (WITHDRAWN membership does not block)', () => {
    expect(() =>
      assertRegistrationAllowed({
        tournament: openTournament,
        existingMembership: { status: 'WITHDRAWN' },
      }),
    ).not.toThrow()
  })

  it('rejects registration when the roster is frozen', () => {
    expect(() =>
      assertRegistrationAllowed({ tournament: closedTournament, existingMembership: null }),
    ).toThrow(RegistrationError)
  })

  it('rejects registration when registration has not been opened yet', () => {
    expect(() =>
      assertRegistrationAllowed({ tournament: draftTournament, existingMembership: null }),
    ).toThrow(RegistrationError)
  })
})

describe('withdrawal eligibility', () => {
  it('allows withdrawal while registered and the roster is not frozen', () => {
    expect(() =>
      assertWithdrawalAllowed({
        tournament: openTournament,
        membership: { status: 'REGISTERED' },
      }),
    ).not.toThrow()
  })

  it('rejects withdrawal once the roster is frozen', () => {
    expect(() =>
      assertWithdrawalAllowed({
        tournament: closedTournament,
        membership: { status: 'REGISTERED' },
      }),
    ).toThrow(RegistrationError)
  })

  it('rejects withdrawal when there is no active membership', () => {
    expect(() =>
      assertWithdrawalAllowed({
        tournament: openTournament,
        membership: { status: 'WITHDRAWN' },
      }),
    ).toThrow(RegistrationError)
    expect(() =>
      assertWithdrawalAllowed({ tournament: openTournament, membership: null }),
    ).toThrow(RegistrationError)
  })
})
