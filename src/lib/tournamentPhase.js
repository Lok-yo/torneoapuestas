export const PHASE_LABEL = {
  1: '01 REGISTRO',
  2: '02 FASE DE GRUPOS',
  3: '03 TOP 8 (En juego)',
  4: '04 FINALIZADO',
}

/**
 * Derives the exact tournament phase from status + sets.
 *
 * @param {string} status – tournament.status
 * @param {Array} [sets=[]] – tournament_sets (each has a `state` field)
 * @returns {{ step: number, label: string } | null} null when CANCELLED
 */
export function derivePhase(status, sets = []) {
  if (status === 'CANCELLED') return null
  if (status === 'COMPLETED') return { step: 4, label: PHASE_LABEL[4] }

  const hasCompletedSet = sets.some((s) => s.state === 'COMPLETED')
  if (hasCompletedSet) return { step: 3, label: PHASE_LABEL[3] }

  if (status === 'IN_PROGRESS') return { step: 2, label: PHASE_LABEL[2] }
  if (status === 'REGISTRATION_CLOSED') return { step: 2, label: PHASE_LABEL[2] }

  return { step: 1, label: PHASE_LABEL[1] }
}
