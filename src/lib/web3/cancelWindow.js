const PREFIX = 'coliseum-bet-window:'
export const CANCEL_MS = 10 * 60 * 1000

function key(txHash) {
  return `${PREFIX}${String(txHash || '').toLowerCase()}`
}

function readEnd(txHash) {
  try {
    const n = Number(localStorage.getItem(key(txHash)))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeEnd(txHash, end) {
  try {
    localStorage.setItem(key(txHash), String(end))
  } catch {
    // ignore
  }
}

/** First time we see a bet, freeze a 10-minute wall-clock end. Never extend it. */
export function lockCancelWindow(txHash, remainingMs = CANCEL_MS) {
  if (!txHash) return 0
  const existing = readEnd(txHash)
  if (existing) return Math.max(0, existing - Date.now())
  const cap = Math.min(Math.max(0, remainingMs), CANCEL_MS)
  writeEnd(txHash, Date.now() + cap)
  return cap
}

/** Chain remaining 0 → expired forever. Otherwise keep the first lock. */
export function remainingCancelMs(txHash, chainRemainingMs) {
  if (!txHash) return Math.max(0, chainRemainingMs || 0)
  if (!chainRemainingMs || chainRemainingMs <= 0) {
    writeEnd(txHash, Date.now())
    return 0
  }
  return lockCancelWindow(txHash, chainRemainingMs)
}

export function expireCancelWindow(txHash) {
  if (!txHash) return
  writeEnd(txHash, Date.now())
}
