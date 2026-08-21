const LOOPBACK_RPC = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i

export function isDemoAnvil(env = {}, rpcUrl = '') {
  return String(env.VITE_DEMO_ANVIL || '').toLowerCase() === 'true' || LOOPBACK_RPC.test(String(rpcUrl))
}

export function resolveBrowserRpcUrl(rawRpcUrl, origin) {
  const rpcUrl = String(rawRpcUrl || '')
  if (!rpcUrl.startsWith('/')) return rpcUrl
  if (!origin) throw new Error('A browser origin is required for a relative RPC URL.')
  return new URL(rpcUrl, origin).href.replace(/\/$/, '')
}

export function resolveInternalRpcUrl(env = {}) {
  return env.ANVIL_RPC_URL || env.VITE_AMOY_RPC_URL || 'http://127.0.0.1:8545'
}
