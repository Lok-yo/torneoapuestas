// Registration eligibility, membership uniqueness, and roster-freeze
// rules. This is the client-testable mirror of the same rules
// register_participant/withdraw_participant (0009_registration_rpc.sql)
// enforce server-side as the real authority — see design.md "Browser
// writes vs commands". See tournament-operations spec "Registration and
// roster freeze".

export class RegistrationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RegistrationError'
    this.code = code
  }
}

/**
 * @param {{ tournament: { status: string, rosterFrozenAt: string|null }, existingMembership: { status: string }|null }} args
 */
export function assertRegistrationAllowed({ tournament, existingMembership }) {
  if (tournament.status !== 'REGISTRATION_OPEN' || tournament.rosterFrozenAt) {
    throw new RegistrationError('FROZEN_OR_CLOSED', 'Registration is not open for this tournament.')
  }
  if (existingMembership && existingMembership.status === 'REGISTERED') {
    throw new RegistrationError('DUPLICATE', 'You are already registered for this tournament.')
  }
}

/**
 * @param {{ tournament: { status: string, rosterFrozenAt: string|null }, membership: { status: string }|null }} args
 */
export function assertWithdrawalAllowed({ tournament, membership }) {
  if (tournament.rosterFrozenAt) {
    throw new RegistrationError('FROZEN', 'The roster is frozen; withdrawal is no longer possible.')
  }
  if (!membership || membership.status !== 'REGISTERED') {
    throw new RegistrationError('NOT_REGISTERED', 'You do not have an active registration to withdraw.')
  }
}
