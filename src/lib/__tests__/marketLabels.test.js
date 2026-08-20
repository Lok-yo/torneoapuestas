import { describe, expect, it } from 'vitest'
import { matchQuestionId } from '../web3/questionId.js'
import { pickName, resolveQuestion } from '../web3/marketLabels.js'

describe('resolveQuestion', () => {
  const catalog = [
    {
      startgg_event_id: 1644275,
      startgg_set_id: 103921177,
      entrant_a_name: 'Illya',
      entrant_b_name: 'Gaon',
      round: 1,
    },
  ]

  it('maps a questionId back to both player names', () => {
    const id = matchQuestionId(1644275, 103921177)
    const meta = resolveQuestion(id, catalog)
    expect(meta.matchup).toBe('Illya vs Gaon')
    expect(pickName(meta, 0)).toBe('Illya')
    expect(pickName(meta, 1)).toBe('Gaon')
  })
})
