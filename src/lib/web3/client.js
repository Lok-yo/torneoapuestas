// wagmi/viem config for Polygon Amoy — the only chain this MVP targets
// (design.md "Migration / Rollout": Amoy-only deploy). Mounted regardless
// of FEATURE_FLAGS.web3 (a React context provider has no network side
// effect on its own); every actual RPC call only happens from inside a
// web3 hook, which the flag-gated routes never render while the flag is
// off. See src/App.jsx and src/main.jsx.
import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { polygonAmoy } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { isDemoAnvil, resolveBrowserRpcUrl } from './runtime.js'

const rawRpc = import.meta.env.VITE_AMOY_RPC_URL || polygonAmoy.rpcUrls.default.http[0]
const rpc = resolveBrowserRpcUrl(rawRpc, globalThis.location?.origin)
const demoMode = isDemoAnvil(import.meta.env, rpc)

/** Same chain id as Polygon Amoy (80002), with the RPC this app actually uses. */
export const appChain = defineChain({
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: {
    default: { http: [rpc] },
    public: { http: [rpc] },
  },
  blockExplorers: polygonAmoy.blockExplorers,
})

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const connectors = [injected({ shimDisconnect: true })]
if (!demoMode && walletConnectProjectId) {
  connectors.push(walletConnect({ projectId: walletConnectProjectId }))
}

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors,
  transports: {
    [appChain.id]: http(rpc),
  },
  batch: { multicall: false },
})

export const AMOY_CHAIN_ID = appChain.id
export const AMOY_RPC_URL = rpc
export const AMOY_ADD_CHAIN = {
  chainName: demoMode ? 'COLISEUM Local' : 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: [rpc],
  blockExplorerUrls: demoMode ? [] : ['https://amoy.polygonscan.com'],
}
