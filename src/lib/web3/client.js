// wagmi/viem config for Polygon Amoy — the only chain this MVP targets
// (design.md "Migration / Rollout": Amoy-only deploy). Mounted regardless
// of FEATURE_FLAGS.web3 (a React context provider has no network side
// effect on its own); every actual RPC call only happens from inside a
// web3 hook, which the flag-gated routes never render while the flag is
// off. See src/App.jsx and src/main.jsx.
import { createConfig, http } from 'wagmi'
import { polygonAmoy } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const connectors = [injected()]
if (walletConnectProjectId) {
  connectors.push(walletConnect({ projectId: walletConnectProjectId }))
}

export const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  connectors,
  transports: {
    [polygonAmoy.id]: http(import.meta.env.VITE_AMOY_RPC_URL || undefined),
  },
})

export const AMOY_CHAIN_ID = polygonAmoy.id
