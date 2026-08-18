// On-chain wallet view — rendered by WalletPage.jsx at the /wallet route
// only when FEATURE_FLAGS.web3 is on (design.md Decision 7 / File
// Changes: "WalletPage.jsx Modified: Repointed on-chain"). Never
// custodial: shows the connected wallet's own USDC balance + CTF
// position balances read directly from chain/cache, with zero
// server-side balance authority (onchain-prediction-markets spec
// "USDC Escrow").
import { useEffect, useState } from 'react'
import { Wallet, LogOut } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { useWalletConnect } from '../../lib/web3/hooks.js'
import { ERC20_ABI, USDC_ADDRESS } from '../../lib/web3/contracts.js'
import { listOnchainPositions } from '../../repositories/onchainMarketRepository.js'
import { formatUsdc } from '../../lib/web3/format.js'

export default function OnchainWalletView() {
  const { address, isConnected, connectors, connect, disconnect, isConnecting, connectError } = useWalletConnect()
  const [positions, setPositions] = useState([])

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && USDC_ADDRESS) },
  })

  useEffect(() => {
    if (!address) {
      setPositions([])
      return
    }
    listOnchainPositions(address)
      .then(setPositions)
      .catch(() => setPositions([]))
  }, [address])

  if (!isConnected) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-950 p-8 text-center shadow-2xl backdrop-blur-md">
        <Wallet size={32} className="text-violet-400" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">The Treasury</p>
        <h1 className="text-xl font-semibold text-zinc-50">Conectá tu wallet</h1>
        <p className="text-sm text-zinc-400">
          GG2 nunca custodia tus fondos — tu USDC y posiciones viven directamente en Polygon Amoy.
        </p>
        <div className="flex w-full flex-col gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect(connector)}
              disabled={isConnecting}
              className="rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
            >
              {isConnecting ? 'Conectando…' : `Conectar con ${connector.name}`}
            </button>
          ))}
        </div>
        {connectError && (
          <p role="alert" className="text-xs text-rose-400">
            {connectError.name === 'ProviderNotFoundError' || connectError.message?.includes('Provider not found')
              ? 'No se detectó ninguna wallet instalada en tu navegador. Por favor instalá una extensión como MetaMask o Rabby.'
              : connectError.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">The Treasury</p>
          <h1 className="text-2xl font-semibold text-zinc-50">Billetera on-chain</h1>
          <p className="font-mono text-xs text-zinc-500">{address}</p>
        </div>
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700"
        >
          <LogOut size={14} /> Desconectar
        </button>
      </div>

      <div className="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-950 p-6">
        <span className="text-xs uppercase tracking-wider text-zinc-400">Saldo USDC (wallet)</span>
        <p className="mt-1 font-mono text-4xl font-bold text-zinc-50">{formatUsdc(usdcBalance)} USDC</p>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Posiciones abiertas</h2>
        {positions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">Todavía no tenés posiciones en mercados on-chain.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Mercado (condition)
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {positions.map((p) => (
                  <tr key={`${p.condition_id}-${p.position_id}`} className="hover:bg-zinc-900/30">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{p.condition_id}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-200">{p.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
