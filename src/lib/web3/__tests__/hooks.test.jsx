import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  connectMock,
  disconnectMock,
  switchChainMock,
  metaMaskConnector,
  amoyAddChain,
} = vi.hoisted(() => ({
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
  switchChainMock: vi.fn(),
  metaMaskConnector: { id: 'metaMask', name: 'MetaMask' },
  amoyAddChain: {
    chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://amoy.polygonscan.com'],
  },
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false, chain: undefined }),
  useConnect: () => ({
    connect: connectMock,
    connectors: [metaMaskConnector],
    isPending: false,
    error: null,
  }),
  useDisconnect: () => ({ disconnect: disconnectMock }),
  useReadContract: vi.fn(),
  useSwitchChain: () => ({ switchChain: switchChainMock, isPending: false }),
  useWaitForTransactionReceipt: vi.fn(),
  useWriteContract: vi.fn(),
}))

vi.mock('wagmi/actions', () => ({
  getAccount: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('../client.js', () => ({
  AMOY_ADD_CHAIN: amoyAddChain,
  AMOY_CHAIN_ID: 80002,
  wagmiConfig: {},
}))

import { useWalletConnect } from '../hooks.js'

describe('useWalletConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connects MetaMask directly to the configured Amoy chain', () => {
    const { result } = renderHook(() => useWalletConnect())

    act(() => result.current.connect(metaMaskConnector))

    expect(connectMock).toHaveBeenCalledWith({
      connector: metaMaskConnector,
      chainId: 80002,
    })
  })

  it('preserves the manual Amoy switch fallback', () => {
    const { result } = renderHook(() => useWalletConnect())

    act(() => result.current.switchToAmoy())

    expect(switchChainMock).toHaveBeenCalledWith({
      chainId: 80002,
      addEthereumChainParameter: amoyAddChain,
    })
  })
})
