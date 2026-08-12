// RED (then GREEN against src/domain/tournaments/lifecycle.js): proves the
// tournament lifecycle policy — DRAFT -> REGISTRATION_OPEN ->
// REGISTRATION_CLOSED -> IN_PROGRESS -> COMPLETED, plus cancellation from
// any non-terminal state — and that invalid transitions are rejected. See
// tasks.md 3.2 and tournament-operations spec "Validated tournament
// lifecycle". This module encodes the same transition table the
// advance_tournament_state RPC (0008) authorizes server-side; the RPC is
// the actual authority, this is the client-testable mirror used to keep
// the UI's optimistic affordances (which actions are even offered) honest.
import { describe, it, expect } from 'vitest'
import { nextStatus, LifecycleError, TOURNAMENT_STATUSES } from '../lifecycle.js'

describe('tournament lifecycle', () => {
  it('walks the full happy path from DRAFT to COMPLETED', () => {
    let status = 'DRAFT'
    status = nextStatus(status, 'OPEN_REGISTRATION')
    expect(status).toBe('REGISTRATION_OPEN')
    status = nextStatus(status, 'CLOSE_REGISTRATION')
    expect(status).toBe('REGISTRATION_CLOSED')
    status = nextStatus(status, 'START')
    expect(status).toBe('IN_PROGRESS')
    status = nextStatus(status, 'COMPLETE')
    expect(status).toBe('COMPLETED')
  })

  it.each(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS'])(
    'allows cancellation from %s',
    (status) => {
      expect(nextStatus(status, 'CANCEL')).toBe('CANCELLED')
    },
  )

  it('rejects skipping a state (DRAFT straight to IN_PROGRESS)', () => {
    expect(() => nextStatus('DRAFT', 'START')).toThrow(LifecycleError)
  })

  it('rejects re-opening registration once closed', () => {
    expect(() => nextStatus('REGISTRATION_CLOSED', 'OPEN_REGISTRATION')).toThrow(LifecycleError)
  })

  it('rejects any transition out of a terminal state', () => {
    expect(() => nextStatus('COMPLETED', 'CANCEL')).toThrow(LifecycleError)
    expect(() => nextStatus('CANCELLED', 'OPEN_REGISTRATION')).toThrow(LifecycleError)
  })

  it('rejects an unknown action', () => {
    expect(() => nextStatus('DRAFT', 'TELEPORT')).toThrow(LifecycleError)
  })

  it('exposes the full status enum for UI/state-badge consumers', () => {
    expect(TOURNAMENT_STATUSES).toEqual([
      'DRAFT',
      'REGISTRATION_OPEN',
      'REGISTRATION_CLOSED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ])
  })
})
