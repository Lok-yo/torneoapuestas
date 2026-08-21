import { describe, it, expect } from 'vitest'
import { derivePhase, PHASE_LABEL } from '../tournamentPhase.js'

describe('derivePhase', () => {
  it('returns null for CANCELLED', () => {
    expect(derivePhase('CANCELLED')).toBeNull()
  })

  it('returns step 4 for COMPLETED', () => {
    const result = derivePhase('COMPLETED')
    expect(result).toEqual({ step: 4, label: PHASE_LABEL[4] })
  })

  it('returns step 4 when sets exist and all are COMPLETED', () => {
    const sets = [{ state: 'COMPLETED' }, { state: 'COMPLETED' }]
    expect(derivePhase('IN_PROGRESS', sets)).toEqual({ step: 4, label: PHASE_LABEL[4] })
  })

  it('returns step 3 when sets exist and not all are COMPLETED', () => {
    const sets = [
      { state: 'COMPLETED' },
      { state: 'PENDING' },
    ]
    expect(derivePhase('IN_PROGRESS', sets)).toEqual({ step: 3, label: PHASE_LABEL[3] })
  })

  it('returns step 2 for IN_PROGRESS with no sets', () => {
    expect(derivePhase('IN_PROGRESS', [])).toEqual({ step: 2, label: PHASE_LABEL[2] })
  })

  it('returns step 3 for IN_PROGRESS with only PENDING sets (since sets exist)', () => {
    const sets = [{ state: 'PENDING' }, { state: 'PENDING' }]
    expect(derivePhase('IN_PROGRESS', sets)).toEqual({ step: 3, label: PHASE_LABEL[3] })
  })

  it('returns step 3 for IN_PROGRESS with IN_PROGRESS sets (since sets exist)', () => {
    const sets = [{ state: 'IN_PROGRESS' }]
    expect(derivePhase('IN_PROGRESS', sets)).toEqual({ step: 3, label: PHASE_LABEL[3] })
  })

  it('returns step 2 for REGISTRATION_CLOSED', () => {
    expect(derivePhase('REGISTRATION_CLOSED')).toEqual({ step: 2, label: PHASE_LABEL[2] })
  })

  it('returns step 1 for REGISTRATION_OPEN', () => {
    expect(derivePhase('REGISTRATION_OPEN')).toEqual({ step: 1, label: PHASE_LABEL[1] })
  })

  it('returns step 1 for DRAFT', () => {
    expect(derivePhase('DRAFT')).toEqual({ step: 1, label: PHASE_LABEL[1] })
  })

  it('defaults to step 1 for unknown status', () => {
    expect(derivePhase('UNKNOWN')).toEqual({ step: 1, label: PHASE_LABEL[1] })
  })
})
