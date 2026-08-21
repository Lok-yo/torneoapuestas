import { isDemoAnvil } from './runtime.js'

/** True when the Vite client is pointed at a local Anvil node. */
export function isLocalAnvil() {
  const rpc = String(import.meta.env.VITE_AMOY_RPC_URL || '')
  return isDemoAnvil(import.meta.env, rpc)
}

async function postAnvil(path, body) {
  const res = await fetch(`/__anvil/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Anvil helper ${path} failed (${res.status})`)
  }
  return data
}

export async function registerStartggEvent(startggEventId) {
  return postAnvil('register', { startggEventId: String(startggEventId) })
}

export async function activateLocalMarket(questionId) {
  return postAnvil('activate', { questionId })
}

export async function createLocalMarket({
  address,
  questionId,
  startggEventId,
  marketType,
  seedLiquidity,
  eventStartsAt,
}) {
  return postAnvil('create-market', {
    address,
    questionId,
    startggEventId: String(startggEventId),
    marketType: Number(marketType),
    seedLiquidity: String(seedLiquidity),
    eventStartsAt: String(eventStartsAt),
  })
}

/** Human-readable payload MetaMask signs locally (not a contract tx). */
export function localConfirmMessage({ action, address, accountId, amount, questionId, outcomeIndex }) {
  const lines = [`COLISEUM — Confirmar ${action}`, `Wallet: ${address}`]
  if (accountId) lines.push(`Cuenta: ${accountId}`)
  if (questionId) lines.push(`Mercado: ${questionId}`)
  if (outcomeIndex !== undefined && outcomeIndex !== null) lines.push(`Lado: ${String(outcomeIndex)}`)
  if (amount !== undefined && amount !== null) lines.push(`Unidades: ${String(amount)}`)
  lines.push(`Nonce: ${Date.now()}`)
  return lines.join('\n')
}

export async function addLocalFunds({ address, amount, accountId, message, signature }) {
  return postAnvil('add-funds', {
    address,
    amount: String(amount),
    accountId,
    message,
    signature,
  })
}

export async function withdrawLocalProfits({ address, amount, accountId, message, signature }) {
  return postAnvil('withdraw-profits', {
    address,
    amount: String(amount),
    accountId,
    message,
    signature,
  })
}

export async function placeLocalBet({ address, questionId, amount, outcomeIndex, accountId, message, signature }) {
  return postAnvil('place-bet', {
    address,
    questionId,
    amount: String(amount),
    outcomeIndex: String(outcomeIndex),
    accountId,
    message,
    signature,
  })
}

export async function claimLocal({ address, questionId, message, signature }) {
  return postAnvil('settle', { address, questionId, message, signature })
}
