// Tournament lifecycle policy: DRAFT -> REGISTRATION_OPEN ->
// REGISTRATION_CLOSED -> IN_PROGRESS -> COMPLETED, plus cancellation from
// any non-terminal state. This is the same transition table the
// advance_tournament_state RPC (0008_lifecycle_rpc.sql) authorizes
// server-side and never bypasses; it is exported so the UI can decide
// which actions to even offer without duplicating the policy by hand. See
// tournament-operations spec "Validated tournament lifecycle" and
// design.md "Interfaces / Contracts".

export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]

export class LifecycleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LifecycleError'
  }
}

const TRANSITIONS = {
  DRAFT: { OPEN_REGISTRATION: 'REGISTRATION_OPEN', CANCEL: 'CANCELLED' },
  REGISTRATION_OPEN: { CLOSE_REGISTRATION: 'REGISTRATION_CLOSED', CANCEL: 'CANCELLED' },
  REGISTRATION_CLOSED: { START: 'IN_PROGRESS', CANCEL: 'CANCELLED' },
  IN_PROGRESS: { COMPLETE: 'COMPLETED', CANCEL: 'CANCELLED' },
  COMPLETED: {},
  CANCELLED: {},
}

/**
 * Computes the resulting status for a given (currentStatus, action) pair,
 * or throws LifecycleError if the transition is not permitted.
 * @param {string} currentStatus
 * @param {'OPEN_REGISTRATION'|'CLOSE_REGISTRATION'|'START'|'COMPLETE'|'CANCEL'} action
 * @returns {string}
 */
export function nextStatus(currentStatus, action) {
  const allowed = TRANSITIONS[currentStatus]
  if (!allowed) {
    throw new LifecycleError(`Unknown tournament status: ${currentStatus}`)
  }
  const target = allowed[action]
  if (!target) {
    throw new LifecycleError(`Cannot apply action "${action}" from status "${currentStatus}"`)
  }
  return target
}

/** Returns the list of actions permitted from a given status (for UI affordances). */
export function allowedActions(currentStatus) {
  return Object.keys(TRANSITIONS[currentStatus] ?? {})
}
