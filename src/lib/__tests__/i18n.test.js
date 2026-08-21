// RED (now GREEN): both locale dictionaries must define the odds tooltip and
// the MatchCard waiting-players copy (tasks.md 6.1-6.2, odds-display R1 +
// i18n R1). The hardcoded Spanish tooltips in the widgets are replaced by
// t('pred.oddsTooltip') — these keys are what the lookup must resolve.
import { describe, it, expect } from 'vitest'
import { es } from '../../i18n/es.js'
import { en } from '../../i18n/en.js'

describe('i18n tooltip keys', () => {
  it('es defines pred.oddsTooltip with the house-fee explanation', () => {
    expect(es.pred.oddsTooltip).toBe(
      'Si apuestas 10 USDC y ganas, recibes ~19 USDC (después del 5% de comisión de la casa)',
    )
  })

  it('en defines an equivalent pred.oddsTooltip', () => {
    expect(typeof en.pred.oddsTooltip).toBe('string')
    expect(en.pred.oddsTooltip.length).toBeGreaterThan(0)
    expect(en.pred.oddsTooltip).toContain('5%')
    expect(en.pred.oddsTooltip).toContain('19 USDC')
  })

  it('es defines match.waitingPlayers as the MatchCard tooltip text', () => {
    expect(es.match.waitingPlayers).toBe('Esperando jugadores...')
  })

  it('en defines an equivalent match.waitingPlayers', () => {
    expect(typeof en.match.waitingPlayers).toBe('string')
    expect(en.match.waitingPlayers.length).toBeGreaterThan(0)
  })
})