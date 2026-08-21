import { useState, useEffect, useRef } from 'react'
import { X, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWalletConnect, useCreateMarket, useHouseAccount } from '../lib/web3/hooks.js'
import { questionIdFromOutcomeRef } from '../lib/web3/questionId.js'
import { isLocalAnvil, registerStartggEvent, activateLocalMarket } from '../lib/web3/localDev.js'
import { parseUsdc, formatUsdc } from '../lib/web3/format.js'
import { MARKET_FACTORY_ADDRESS } from '../lib/web3/contracts.js'
import { translateError } from '../lib/web3/translateError.js'
import { checkDuplicateMarketByQuestionId } from '../repositories/tournamentRepository.js'
import MarketPreview from './MarketPreview.jsx'

const CREATION_BOND_USDC = 1n * 1_000_000n
const MIN_LIQUIDITY_USDC = 100n * 1_000_000n

export default function CreateMarketModal({ set: s, startggEventId: propEventId, onClose }) {
  const startggEventId = propEventId ?? s.startgg_event_id;
  const navigate = useNavigate()
  const { isConnected, connectors, connect, connectError, isCorrectChain, switchToAmoy } = useWalletConnect()
  const { createMarket, isPending } = useCreateMarket()
  const { account } = useHouseAccount()

  const [seedLiquidity, setSeedLiquidity] = useState('100')
  const [error, setError] = useState(null)
  const dialogRef = useRef(null)
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.focus()
  }, [])

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

  // Matches MIN_LIQUIDITY_USDC (100) and the input's min="100" — a
  // seed below 100 USDC can never pass handleSubmit, so block it in the UI.
  const isFormInvalid = Number(seedLiquidity) < 100

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
    const totalCost = CREATION_BOND_USDC + seed
    if (!isLocalAnvil() && account.balance < totalCost) {
      setError(
        `Esta línea cuesta ${formatUsdc(totalCost)} USDC (1 de bono + ${formatUsdc(seed)} de liquidez) y en la casa tenés ${formatUsdc(account.balance)}. Agregá fondos o bajá la liquidez.`,
      )
      return
    }

    try {
      const questionId = questionIdFromOutcomeRef(startggEventId || 0, marketType, outcomeRef)

      const isDuplicate = await checkDuplicateMarketByQuestionId(questionId)
      if (isDuplicate) {
        setError('Ya existe un mercado activo para este set.')
        return
      }

      const totalApproval = CREATION_BOND_USDC + seed

      if (startggEventId && isLocalAnvil()) {
        await registerStartggEvent(startggEventId)
      }

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

      if (isLocalAnvil()) {
        try {
          await activateLocalMarket(questionId)
        } catch (activateErr) {
          console.warn('[CreateMarketModal] local activate failed', activateErr)
        }
      }

      navigate(`/mercados/${questionId}`)
    } catch (err) {
      console.error('[CreateMarketModal] handleSubmit error', err)
      setError(translateError(err) || 'No pudimos crear el mercado.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-modal-title-main"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 focus:outline-none"
      >
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
              Liquidez inicial (USDC, mínimo 100)
            </label>
            <input
              id="modal-seed-liquidity"
              type="number"
              min="100"
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
                  if (!isNaN(n) && n <= 100) e.preventDefault()
                }
              }}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
            />
            {Number(seedLiquidity) < 100 && seedLiquidity !== "" && (
              <p className="mt-1 text-xs text-rose-400">Mínimo 100 USDC</p>
            )}
          </div>

          <p className="text-[12px] text-zinc-400">
            Abrir la línea no usa el pozo de los apostadores. Los 101 USDC (1 de bono anti-spam + 100 de semilla del
            mercado on-chain) los cubre la simulación local. La plata con la que se apuesta es la que cada uno mete en
            <span className="text-white"> Agregar fondos</span>. Casa ahora: {formatUsdc(account.balance)} USDC.
          </p>

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
                <p className="mb-1 text-center text-xs text-zinc-400">Elige tu wallet para pagar y crear el mercado</p>
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
            ) : !isCorrectChain ? (
              <button
                type="button"
                onClick={switchToAmoy}
                className="w-full border border-amber-500/40 bg-amber-950/20 py-3 text-sm font-semibold text-amber-300"
              >
                Cambiar a chain 80002 (Anvil / Amoy)
              </button>
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
