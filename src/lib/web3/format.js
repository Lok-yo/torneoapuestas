// USDC uses 6 decimals on-chain (contracts/src/MarketFactory.sol:
// CREATION_BOND = 25e6, etc.). Formats a bigint/number wei-style amount
// into a human 2-decimal display string.
export function formatUsdc(amount) {
  if (amount === undefined || amount === null) return '0.00'
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(Number(amount)))
  const whole = value / 1_000_000n
  const fraction = value % 1_000_000n
  const cents = (fraction * 100n) / 1_000_000n
  return `${whole.toString()}.${cents.toString().padStart(2, '0')}`
}

/** Parses a human "12.34" USDC string into a 6-decimal bigint. */
export function parseUsdc(input) {
  const num = Number(input)
  if (Number.isNaN(num) || num < 0) return 0n
  return BigInt(Math.round(num * 1_000_000))
}
