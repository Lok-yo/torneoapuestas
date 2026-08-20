/**
 * Stake, payout and P/L for a user position against a resolved/open market.
 * Winning shares pay $1.00 each (see buy_market_shares / _settle_market).
 */
export function describePosition({ shares, avgPrice, marketStatus, outcomeId, resolutionOutcomeId }) {
  const qty = Number(shares) || 0
  const price = Number(avgPrice) || 0
  const stake = roundMoney(qty * price)

  if (marketStatus === 'RESOLVED') {
    const won = Boolean(resolutionOutcomeId) && resolutionOutcomeId === outcomeId
    const payout = won ? roundMoney(qty * 1) : 0
    return {
      stake,
      payout,
      pnl: roundMoney(payout - stake),
      result: won ? 'win' : 'loss',
    }
  }

  return { stake, payout: null, pnl: null, result: 'open' }
}

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function sharesForStake(stakeUsd, price) {
  const p = Number(price)
  if (!(p > 0)) return 0
  return roundMoney((Number(stakeUsd) || 0) / p)
}

export const ROUND_LABEL = {
  1: 'Grand Finals',
  2: 'Winners Finals',
  3: 'Losers Finals',
  4: 'Winners Semis',
  5: 'Losers Semis',
  6: 'Round of 8',
  7: 'Quarterfinals',
}

export function roundLabel(round) {
  return ROUND_LABEL[Number(round)] ?? `Ronda ${round}`
}
