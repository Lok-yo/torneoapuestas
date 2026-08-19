// Permissionless market creation — proposal.md "market creation:
// permissionless: Any wallet may create a market on any ingested
// start.gg event — no admin approval gate". Registered in App.jsx only
// behind FEATURE_FLAGS.web3 (resolves to NotFoundPage while off). See
// onchain-prediction-markets spec "Permissionless Market Creation
// Eligibility" / "Permissionless Market Creation Guardrail (Creation
// Bond)".
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, AlertCircle, ToggleLeft, ToggleRight, AlertTriangle, ExternalLink } from 'lucide-react'
import { keccak256, encodeAbiParameters } from 'viem'
import { useWalletConnect, useCreateMarket } from '../lib/web3/hooks.js'
import { parseUsdc, formatUsdc } from '../lib/web3/format.js'
import { MARKET_FACTORY_ADDRESS } from '../lib/web3/contracts.js'
import { checkDuplicateMarket } from '../repositories/tournamentRepository.js'
import TournamentSearchCombobox from '../components/TournamentSearchCombobox.jsx'
import ManualEventIdInput from '../components/ManualEventIdInput.jsx'
import MarketPreview from '../components/MarketPreview.jsx'

const CREATION_BOND_USDC = 25n * 1_000_000n
const MIN_LIQUIDITY_USDC = 10n * 1_000_000n

export default function CreateMarketPage() {
  const navigate = useNavigate()
  const { isConnected, connectors, connect, connectError } = useWalletConnect()
  const { createMarket, isPending } = useCreateMarket()

  const [selectedTournament, setSelectedTournament] = useState(null)
  const [manualEventId, setManualEventId] = useState('')
  const [useManualInput, setUseManualInput] = useState(false)
  const [marketType, setMarketType] = useState(0)
  const [outcomeRef, setOutcomeRef] = useState('')
  const [seedLiquidity, setSeedLiquidity] = useState('100')
  const [error, setError] = useState(null)

  const resolvedEventId = useManualInput ? manualEventId : selectedTournament?.startgg_event_id

  const refTrimmed = outcomeRef.trim()
  const perMatchRefInvalid = marketType === 0 && refTrimmed.length > 0 && !/(?:vs|—)/i.test(refTrimmed) && refTrimmed.length <= 8
  const isFormInvalid =
    !resolvedEventId ||
    !refTrimmed ||
    refTrimmed.length < 3 ||
    perMatchRefInvalid ||
    Number(seedLiquidity) < 10

  function toggleManualInput() {
    setUseManualInput((prev) => !prev)
    setSelectedTournament(null)
    setManualEventId('')
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!resolvedEventId) {
      setError('Seleccioná un torneo o ingresá un ID de evento manualmente.')
      return
    }

    const ref = outcomeRef.trim()
    if (!ref) {
      setError('Completá la referencia del resultado.')
      return
    }

    if (ref.length < 3) {
      setError('La referencia debe tener al menos 3 caracteres.')
      return
    }

    if (marketType === 0 && !/(?:vs|—)/i.test(ref) && ref.length <= 8) {
      setError('Incluí los dos jugadores (Ej: Mango vs Zain).')
      return
    }

    const seed = parseUsdc(seedLiquidity)
    if (seed < MIN_LIQUIDITY_USDC) {
      setError(`La liquidez inicial debe ser al menos ${formatUsdc(MIN_LIQUIDITY_USDC)} USDC.`)
      return
    }

    try {
      const isDuplicate = await checkDuplicateMarket(BigInt(resolvedEventId))
      if (isDuplicate) {
        setError('Ya existe un mercado activo para este evento. Intentá con otro.')
        return
      }

      const questionId = keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
          [BigInt(resolvedEventId), marketType, keccak256(new TextEncoder().encode(outcomeRef.trim()))],
        ),
      )

      const eventStartsAt = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const totalApproval = CREATION_BOND_USDC + seed

      await createMarket({
        questionId,
        startggEventId: BigInt(resolvedEventId),
        marketType,
        seedLiquidity: seed,
        eventStartsAt,
        totalApproval,
      })

      navigate(`/mercados/${questionId}`)
    } catch (err) {
      setError(err?.shortMessage ?? err?.message ?? 'No pudimos crear el mercado.')
    }
  }

  if (!MARKET_FACTORY_ADDRESS) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-amber-800/50 bg-amber-950/20 p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-2 text-amber-400" />
        <p className="text-sm text-amber-300">El contrato de mercados no está configurado en este entorno.</p>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">Conectá una wallet para crear un mercado.</p>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            onClick={() => connect(connector)}
            className="rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
          >
            Conectar con {connector.name === 'Injected' ? 'MetaMask / Rabby' : connector.name}
          </button>
        ))}
        {connectError && (
          <p role="alert" className="text-xs text-rose-400">
            {connectError.name === 'ProviderNotFoundError' || connectError.message?.includes('Provider not found')
              ? 'No se detectó ninguna wallet instalada en tu navegador. Por favor instalá una extensión como MetaMask o Rabby.'
              : connectError.message}
          </p>
        )}
        <a href="https://ethereum.org/wallets" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"><ExternalLink size={12} />¿Qué es una wallet?</a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-2">
        <PlusCircle className="text-violet-400" size={20} />
        <h1 className="text-xl font-semibold text-zinc-50">Crear mercado</h1>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Cualquier wallet puede crear un mercado sobre un evento de start.gg. Se requiere un bono
        reembolsable de {formatUsdc(CREATION_BOND_USDC)} USDC, más al menos {formatUsdc(MIN_LIQUIDITY_USDC)} USDC de
        liquidez inicial.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">

        {/* Tournament selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-zinc-400">Evento de start.gg</label>

          {!useManualInput ? (
            <TournamentSearchCombobox
              onSelect={(t) => {
                setSelectedTournament(t)
                setError(null)
              }}
              disabled={isPending}
            />
          ) : (
            <ManualEventIdInput
              value={manualEventId}
              onChange={(v) => { setManualEventId(v); setError(null) }}
              onClear={() => { setManualEventId(''); setError(null) }}
              disabled={isPending}
            />
          )}

          <button
            type="button"
            onClick={toggleManualInput}
            className="flex w-fit items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            {useManualInput ? (
              <ToggleRight size={16} className="text-violet-400" />
            ) : (
              <ToggleLeft size={16} />
            )}
            {useManualInput ? 'Buscar torneo en la DB' : '¿No lo encontrás? Ingresá el ID manualmente'}
          </button>
        </div>

        {/* Market type */}
        <div>
          <label htmlFor="market-type" className="mb-1 block text-xs font-medium text-zinc-400">
            Tipo de mercado
          </label>
          <select
            id="market-type"
            value={marketType}
            onChange={(e) => {
              const val = Number(e.target.value)
              setMarketType(val)
              if (val === 1) setOutcomeRef('tournament-winner')
              else if (outcomeRef === 'tournament-winner') setOutcomeRef('')
              setError(null)
            }}
            disabled={isPending}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
          >
            <option value={0}>Por partido (per-match)</option>
            <option value={1}>Ganador del torneo (per-tournament-winner)</option>
          </select>
        </div>

        {/* Outcome ref */}
        <div>
          <label htmlFor="outcome-ref" className="mb-1 block text-xs font-medium text-zinc-400">
            {marketType === 0 ? '¿Qué partido se resuelve?' : 'Referencia del ganador'}
          </label>
          <input
            id="outcome-ref"
            type="text"
            value={outcomeRef}
            onChange={(e) => setOutcomeRef(e.target.value)}
            placeholder={marketType === 0 ? 'Ej: Mango vs Zain — Winners Semis' : 'Ej: Campeón del torneo'}
            disabled={isPending || marketType === 1}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
          />
          <div className="mt-1 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
            <p className="text-[11px] text-amber-200/80">Este mercado queda grabado on-chain de forma inmutable. Si los datos son incorrectos, cualquier wallet puede desafiar el mercado y perderás el bono de creación.</p>
          </div>
        </div>

        {/* Liquidity */}
        <div>
          <label htmlFor="seed-liquidity" className="mb-1 block text-xs font-medium text-zinc-400">
            Liquidez inicial (USDC, mínimo 10)
          </label>
          <input
            id="seed-liquidity"
            type="number"
            min="10"
            step="0.01"
            value={seedLiquidity}
            onChange={(e) => setSeedLiquidity(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
          />
          {Number(seedLiquidity) < 10 && seedLiquidity !== "" && (
            <p className="mt-1 text-xs text-rose-400">Mínimo 10 USDC</p>
          )}
        </div>

        {/* Preview */}
        {(selectedTournament || (useManualInput && manualEventId)) && (
          <MarketPreview
            tournament={selectedTournament ?? { name: `Evento #${manualEventId}`, game_id: '—', created_at: null }}
            marketType={marketType}
            outcomeRef={outcomeRef}
            liquidity={Number(seedLiquidity || 0)}
          />
        )}

        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending || isFormInvalid}
          className="rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {isPending ? 'Confirmando…' : 'Crear mercado'}
        </button>
      </form>
    </div>
  )
}
