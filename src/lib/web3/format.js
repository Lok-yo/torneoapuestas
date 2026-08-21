// USDC uses 6 decimals on-chain (contracts/src/MarketFactory.sol:
// CREATION_BOND = 25e6, etc.). Formats a bigint/number wei-style amount
// into a human 2-decimal display string.
export function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatUsdc(amount) {
  if (amount === undefined || amount === null) return '0.00'
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(Number(amount)))
  const whole = value / 1_000_000n
  const fraction = value % 1_000_000n
  const cents = (fraction * 100n) / 1_000_000n
  return `${whole.toString()}.${cents.toString().padStart(2, '0')}`
}

/** Decimal odds from a 1e6 fixed-point uint (0 → em dash). */
export function formatOdds(amount) {
  if (amount === undefined || amount === null) return '—'
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) return '—'
    return `x${amount.toFixed(2)}`
  }
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(Number(amount)))
  if (value === 0n) return '—'
  const whole = value / 1_000_000n
  const frac = ((value % 1_000_000n) * 100n) / 1_000_000n
  return `x${whole.toString()}.${frac.toString().padStart(2, '0')}`
}

export function openingOddsFromProb(prob) {
  const p = Math.min(0.95, Math.max(0.05, Number(prob) || 0.5))
  return 1 / p
}

export const HOUSE_BPS = 500n
export const MIN_WIN_BPS = 100n
export const OPENING_MAX = 100_000_000n
export const MIN_BET = 1_000_000n

function asUsdc(v) {
  return typeof v === 'bigint' ? v : 0n
}

/** Max you can add to a side. First bet is capped; then it grows with the other side. */
export function maxBetOnSide(sideStake, otherStake) {
  const mine = asUsdc(sideStake)
  const them = asUsdc(otherStake)
  if (them === 0n) {
    if (mine >= OPENING_MAX) return 0n
    return OPENING_MAX - mine
  }
  const cap = ((10_000n - HOUSE_BPS) * them) / (HOUSE_BPS + MIN_WIN_BPS)
  if (cap <= mine) return 0n
  return cap - mine
}

/** Min you can add so the opposite side still profits if it wins. */
export function minBetOnSide(sideStake, otherStake) {
  const mine = asUsdc(sideStake)
  const them = asUsdc(otherStake)
  if (them === 0n) return MIN_BET
  const numer = 10_000n - HOUSE_BPS
  const denom = HOUSE_BPS + MIN_WIN_BPS
  const need = (them * denom + numer - 1n) / numer
  if (need <= mine) return MIN_BET
  const x = need - mine
  return x < MIN_BET ? MIN_BET : x
}

/**
 * What `stake` would pay if added to `sideStake` against `otherStake`.
 * If the other side is still empty the book cannot execute → refund.
 */
export function estimatedPayout(stake, sideStake, otherStake) {
  const add = asUsdc(stake)
  const mine = asUsdc(sideStake) + add
  const them = asUsdc(otherStake)
  const maxB = maxBetOnSide(sideStake, otherStake)
  const minB = minBetOnSide(sideStake, otherStake)
  const overLimit = add > maxB
  const underLimit = add > 0n && add < minB
  if (add <= 0n) return { payout: 0n, profit: 0n, refund: true, odds: 0n, overLimit, underLimit }
  if (them === 0n) return { payout: 0n, profit: 0n, refund: true, odds: 0n, overLimit, underLimit }
  const pool = mine + them
  const net = pool - (pool * HOUSE_BPS) / 10_000n
  const odds = mine === 0n ? 0n : (net * 1_000_000n) / mine
  const payout = mine === 0n ? 0n : (add * net) / mine
  return { payout, profit: payout - add, refund: false, odds, overLimit, underLimit }
}

/** Existing bet: locked payout from the contract, never the live book. */
export function lockedPositionPayout(userStake, lockedPayout) {
  const mine = asUsdc(userStake)
  const pay = asUsdc(lockedPayout)
  if (mine <= 0n) return { payout: 0n, profit: 0n, pending: true, empty: true }
  if (pay === 0n) return { payout: 0n, profit: 0n, pending: true, empty: false }
  return { payout: pay, profit: pay - mine, pending: false, empty: false }
}

/** Parses a human "12.34" USDC string into a 6-decimal bigint. */
export function parseUsdc(input) {
  const num = Number(input)
  if (Number.isNaN(num) || num < 0) return 0n
  return BigInt(Math.round(num * 1_000_000))
}
