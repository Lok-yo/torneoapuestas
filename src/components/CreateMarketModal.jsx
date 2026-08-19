import { useState, useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react'
import { keccak256, encodeAbiParameters } from 'viem'
import { useNavigate } from 'react-router-dom'
import { useWalletConnect, useCreateMarket } from '../lib/web3/hooks.js'
import { parseUsdc, formatUsdc } from '../lib/web3/format.js'
import { MARKET_FACTORY_ADDRESS } from '../lib/web3/contracts.js'
import { translateError } from '../lib/web3/translateError.js'
import { checkDuplicateMarketByQuestionId } from '../repositories/tournamentRepository.js'
import MarketPreview from './MarketPreview.jsx'

const CREATION_BOND_USDC = 1n * 1_000_000n
const MIN_LIQUIDITY_USDC = 1n * 1_000_000n

export default function CreateMarketModal({ set: s, startggEventId: propEventId, onClose }) {
  const startggEventId = propEventId ?? s.startgg_event_id;
  const navigate = useNavigate()
  const { isConnected, connectors, connect, connectError } = useWalletConnect()
  const { createMarket, isPending } = useCreateMarket()

  const [seedLiquidity, setSeedLiquidity] = useState('1')
  const [error, setError] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const outcomeRef = `set:${s.startgg_set_id}`
  const marketType = 0
  const eventStartsAt = s.event_starts_at
    ? Math.floor(new Date(s.event_starts_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + 3600

  const isFormInvalid = Number(seedLiquidity) < 1

  if (!MARKET_FACTORY_ADDRESS) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-labelledby="market-modal-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-amber-800/50 bg-zinc-900 p-6 text-center">
          <AlertCircle size={32} className="mx-auto mb-2 text-amber-400" />
          <p id="market-modal-title" className="text-sm text-amber-300">El contrato de mercados no está configurado en este entorno.</p>
          <button type="button" onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">Cerrar</button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const seed = parseUsdc(seedLiquidity)
    if (seed < MIN_LIQUIDITY_USDC) {
      setError(`La liquidez inicial debe ser al menos ${formatUsdc(MIN_LIQUIDITY_USDC)} USDC.`)
      return
    }

    try {
      const questionId = keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
          [BigInt(startggEventId || 0), marketType, keccak256(new TextEncoder().encode(outcomeRef))],
        ),
      )

      const isDuplicate = await checkDuplicateMarketByQuestionId(questionId)
      if (isDuplicate) {
        setError('Ya existe un mercado activo para este set.')
        return
      }

      const totalApproval = CREATION_BOND_USDC + seed

      try {
        await createMarket({
          questionId,
          startggEventId: BigInt(startggEventId || 0),
          marketType,
          seedLiquidity: seed,
          eventStartsAt: BigInt(eventStartsAt),
          totalApproval,
        })
      } catch (txErr) {
        console.error('[CreateMarketModal] createMarket failed', txErr)
        setError(translateError(txErr) || 'La transacción falló. Verificá tu wallet y saldo USDC.')
        return
      }

      navigate(`/mercados/${questionId}`)
    } catch (err) {
      console.error('[CreateMarketModal] handleSubmit error', err)
      setError(translateError(err) || 'No pudimos crear el mercado.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="market-modal-title-main" onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <h2 id="market-modal-title-main" className="text-lg font-semibold text-zinc-50">
            Crear mercado — {s.entrant_a_name ?? '?'} vs {s.entrant_b_name ?? '?'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1 text-[12px] text-zinc-400">
          <span>Ronda: <span className="text-zinc-200">Round {s.round}</span></span>
          <span>Ref: <span className="font-mono text-violet-400">{outcomeRef}</span></span>
          <span>Tipo: <span className="text-zinc-200">Por partido (per-match)</span></span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="modal-seed-liquidity" className="mb-1 block text-xs font-medium text-zinc-400">
              Liquidez inicial (USDC, mínimo 1)
            </label>
            <input
              id="modal-seed-liquidity"
              type="number"
              min="1"
              step="0.01"
              value={seedLiquidity}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') { setSeedLiquidity(''); return }
                const n = Number(v)
                if (!isNaN(n)) setSeedLiquidity(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  const n = Number(seedLiquidity)
                  if (!isNaN(n) && n <= 1) e.preventDefault()
                }
              }}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
            />
            {Number(seedLiquidity) < 1 && seedLiquidity !== "" && (
              <p className="mt-1 text-xs text-rose-400">Mínimo 1 USDC</p>
            )}
          </div>

          <MarketPreview
            tournament={{ name: `${s.entrant_a_name ?? '?'} vs ${s.entrant_b_name ?? '?'}`, game_id: 'ssbu', created_at: s.event_starts_at }}
            marketType={marketType}
            outcomeRef={outcomeRef}
            liquidity={Number(seedLiquidity || 0)}
          />

          <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
            <p className="text-[11px] text-amber-200/80">Este mercado queda grabado on-chain de forma inmutable. Si los datos son incorrectos, cualquier wallet puede desafiar el mercado y perderás el bono de creación.</p>
          </div>

          {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

          <div className="mt-2 flex flex-col gap-3">
            {!isConnected ? (
              <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="mb-1 text-center text-xs text-zinc-400">Elegí tu wallet para pagar y crear el mercado</p>
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    type="button"
                    onClick={() => connect(connector)}
                    className="rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
                  >
                    Conectar con {connector.name === 'Injected' ? 'MetaMask / Rabby' : connector.name}
                  </button>
                ))}
                {connectError && (
                  <p role="alert" className="mt-1 text-center text-[11px] text-rose-400">
                    {connectError.name === 'ProviderNotFoundError' || connectError.message?.includes('Provider not found')
                      ? 'No se detectó ninguna wallet instalada en tu navegador.'
                      : connectError.message}
                  </p>
                )}
                <a href="https://ethereum.org/wallets" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                  <ExternalLink size={10} /> ¿Qué es una wallet?
                </a>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isPending || isFormInvalid}
                className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {isPending ? 'Confirmando en tu wallet…' : 'Pagar y Crear Mercado'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
