import { describe, expect, it } from 'vitest'
import { describePosition, sharesForStake } from '../bets.js'

describe('describePosition', () => {
  it('treats an open market as unsettled', () => {
    expect(
      describePosition({
        shares: 10,
        avgPrice: 0.4,
        marketStatus: 'OPEN',
        outcomeId: 'a',
        resolutionOutcomeId: null,
      }),
    ).toEqual({ stake: 4, payout: null, pnl: null, result: 'open' })
  })

  it('credits $1 per winning share', () => {
    expect(
      describePosition({
        shares: 10,
        avgPrice: 0.4,
        marketStatus: 'RESOLVED',
        outcomeId: 'a',
        resolutionOutcomeId: 'a',
      }),
    ).toEqual({ stake: 4, payout: 10, pnl: 6, result: 'win' })
  })

  it('records a full loss when the other side wins', () => {
    expect(
      describePosition({
        shares: 10,
        avgPrice: 0.4,
        marketStatus: 'RESOLVED',
        outcomeId: 'a',
        resolutionOutcomeId: 'b',
      }),
    ).toEqual({ stake: 4, payout: 0, pnl: -4, result: 'loss' })
  })
})

describe('sharesForStake', () => {
  it('converts a USD stake into shares at the current price', () => {
    expect(sharesForStake(10, 0.5)).toBe(20)
  })

  it('returns 0 when price is invalid', () => {
    expect(sharesForStake(10, 0)).toBe(0)
  })
})
