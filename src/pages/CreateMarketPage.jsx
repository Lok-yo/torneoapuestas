// Permissionless market creation — proposal.md "market creation:
// permissionless: Any wallet may create a market on any ingested
// start.gg event — no admin approval gate". Registered in App.jsx only
// behind FEATURE_FLAGS.web3 (resolves to NotFoundPage while off). See
// onchain-prediction-markets spec "Permissionless Market Creation
// Eligibility" / "Permissionless Market Creation Guardrail (Creation
// Bond)".
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, AlertCircle, AlertTriangle, ExternalLink, Loader2, Trophy, Swords, Users } from 'lucide-react'
import { useWalletConnect, useCreateMarket } from '../lib/web3/hooks.js'
import { parseUsdc, formatUsdc } from '../lib/web3/format.js'
import { MARKET_FACTORY_ADDRESS } from '../lib/web3/contracts.js'
import { translateError } from '../lib/web3/translateError.js'
import { questionIdFromOutcomeRef } from '../lib/web3/questionId.js'
import { isLocalAnvil, registerStartggEvent, activateLocalMarket } from '../lib/web3/localDev.js'
import { checkDuplicateMarketByQuestionId, listTournamentSets } from '../repositories/tournamentRepository.js'
import TournamentSearchCombobox from '../components/TournamentSearchCombobox.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import MarketPreview from '../components/MarketPreview.jsx'

const CREATION_BOND_USDC = 1n * 1_000_000n
const MIN_LIQUIDITY_USDC = 100n * 1_000_000n

const ROUND_LABEL = {
  1: 'Grand Finals',
  2: 'Winners Finals',
  3: 'Losers Finals',
  4: 'Winners Semis',
  5: 'Losers Semis',
  6: 'Round of 8',
  7: 'Quarterfinals',
}

export default function CreateMarketPage() {
  const navigate = useNavigate()
  const { isConnected, connectors, connect, connectError, isCorrectChain, switchToAmoy } = useWalletConnect()
  const { createMarket, isPending } = useCreateMarket()

  const [selectedTournament, setSelectedTournament] = useState(null)
  const [marketType, setMarketType] = useState(0)
  const [seedLiquidity, setSeedLiquidity] = useState('100')
  const [error, setError] = useState(null)

  // Loaded from the selected tournament
  const [sets, setSets] = useState([])
  const [setsLoading, setSetsLoading] = useState(false)

  // User selection
  const [selectedSet, setSelectedSet] = useState(null)
  const [selectedEntrant, setSelectedEntrant] = useState(null)

  // Load sets when tournament changes
  useEffect(() => {
    if (!selectedTournament?.id) {
      setSets([])
      setSelectedSet(null)
      setSelectedEntrant(null)
      return
    }

    let cancelled = false
    setSetsLoading(true)
    setSets([])
    setSelectedSet(null)
    setSelectedEntrant(null)
    setError(null)

    listTournamentSets(selectedTournament.id)
      .then((data) => {
        if (!cancelled) setSets(data)
      })
      .catch(() => {
        if (!cancelled) setSets([])
      })
      .finally(() => {
        if (!cancelled) setSetsLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedTournament?.id])

  // Reset selection when market type changes
  useEffect(() => {
    setSelectedSet(null)
    setSelectedEntrant(null)
    setError(null)
  }, [marketType])

  // Extract unique entrant names from the Top 8 sets
  const entrants = useMemo(() => {
    const names = new Set()
    for (const s of sets) {
      if (s.entrant_a_name) names.add(s.entrant_a_name)
      if (s.entrant_b_name) names.add(s.entrant_b_name)
    }
    return [...names].sort()
  }, [sets])

  // Bettable sets (pending, both entrants known, no existing market)
  const availableSets = useMemo(
    () =>
      sets.filter(
        (s) =>
          s.entrant_a_name &&
          s.entrant_b_name &&
          s.entrant_a_name !== 'Por definir' &&
          s.entrant_b_name !== 'Por definir' &&
          (s.state === 'PENDING' || s.state === 'IN_PROGRESS')
      ),
    [sets]
  )

  // Derive outcomeRef from selection
  const outcomeRef =
    marketType === 0 && selectedSet
      ? `set:${selectedSet.startgg_set_id}`
      : marketType === 1 && selectedEntrant
        ? selectedEntrant
        : ''

  const resolvedEventId = selectedTournament?.startgg_event_id

  const isFormInvalid =
    !resolvedEventId ||
    !outcomeRef ||
    Number(seedLiquidity) < 100 ||
    (marketType === 0 && !selectedSet) ||
    (marketType === 1 && !selectedEntrant)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (isFormInvalid) return

    const seed = parseUsdc(seedLiquidity)
    if (seed < MIN_LIQUIDITY_USDC) {
      setError(`La liquidez inicial debe ser al menos ${formatUsdc(MIN_LIQUIDITY_USDC)} USDC.`)
      return
    }

    try {
      const questionId = questionIdFromOutcomeRef(resolvedEventId, marketType, outcomeRef)

      // Duplicate check
      const isDup = await checkDuplicateMarketByQuestionId(questionId)
      if (isDup) {
        setError('Ya existe un mercado activo para esta selección.')
        return
      }

      const eventStartsAt =
        marketType === 0 && selectedSet?.event_starts_at
          ? BigInt(Math.floor(new Date(selectedSet.event_starts_at).getTime() / 1000))
          : BigInt(Math.floor(Date.now() / 1000) + 3600)

      const totalApproval = CREATION_BOND_USDC + seed

      if (isLocalAnvil()) {
        await registerStartggEvent(resolvedEventId)
      }

      await createMarket({
        questionId,
        startggEventId: BigInt(resolvedEventId),
        marketType,
        seedLiquidity: seed,
        eventStartsAt,
        totalApproval,
      })

      if (isLocalAnvil()) {
        try {
          await activateLocalMarket(questionId)
        } catch (activateErr) {
          console.warn('[CreateMarketPage] local activate failed', activateErr)
        }
      }

      navigate(`/mercados/${questionId}`)
    } catch (err) {
      setError(translateError(err) || 'No pudimos crear el mercado.')
    }
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

      {!MARKET_FACTORY_ADDRESS && (
        <div className="mb-6 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4 text-center">
          <AlertCircle size={24} className="mx-auto mb-1 text-amber-400" />
          <p className="text-sm text-amber-300">El contrato de mercados no está configurado. Las transacciones fallarán.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        {/* Tournament selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-zinc-400">Evento de start.gg</label>
          <ErrorBoundary>
            <TournamentSearchCombobox
              onSelect={(t) => {
                setSelectedTournament(t)
                setError(null)
              }}
              disabled={isPending}
            />
          </ErrorBoundary>
        </div>

        {/* Market type */}
        {selectedTournament && (
          <div>
            <label htmlFor="market-type" className="mb-1 block text-xs font-medium text-zinc-400">
              Tipo de mercado
            </label>
            <select
              id="market-type"
              value={marketType}
              onChange={(e) => setMarketType(Number(e.target.value))}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500 disabled:opacity-50"
            >
              <option value={0}>Por partido (per-match)</option>
              <option value={1}>Ganador del torneo (per-tournament-winner)</option>
            </select>
          </div>
        )}

        {/* Loading sets */}
        {selectedTournament && setsLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Cargando Top 8…</span>
          </div>
        )}

        {/* No sets available */}
        {selectedTournament && !setsLoading && sets.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 py-6 text-center">
            <Users size={20} className="mx-auto mb-2 text-zinc-500" />
            <p className="text-sm text-zinc-400">Este torneo todavía no tiene sets del Top 8.</p>
            <p className="mt-1 text-xs text-zinc-600">El poller trae datos cada 60 segundos.</p>
          </div>
        )}

        {/* Per-match: set selector */}
        {selectedTournament && !setsLoading && sets.length > 0 && marketType === 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              <Swords size={12} className="mr-1 inline" />
              Seleccioná el partido
            </label>
            {availableSets.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                No hay partidos disponibles para apostar (ya finalizaron o ya tienen mercado).
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {availableSets.map((s) => {
                  const isSelected = selectedSet?.startgg_set_id === s.startgg_set_id
                  const isAlreadyMarket = s.has_market
                  return (
                    <button
                      key={s.startgg_set_id}
                      type="button"
                      onClick={() => { setSelectedSet(s); setError(null) }}
                      disabled={isPending || isAlreadyMarket}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-violet-500 bg-violet-500/10 text-zinc-100'
                          : isAlreadyMarket
                          ? 'border-zinc-800 bg-zinc-950/50 text-zinc-600 cursor-not-allowed opacity-60'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-sm font-medium ${isAlreadyMarket ? 'text-zinc-600' : ''}`}>
                          {s.entrant_a_name} vs {s.entrant_b_name}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {ROUND_LABEL[s.round] ?? `Ronda ${s.round}`} · Slot {s.slot + 1}
                        </span>
                      </div>
                      {isSelected && !isAlreadyMarket && (
                        <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          Seleccionado
                        </span>
                      )}
                      {isAlreadyMarket && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                          Mercado activo
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Per-tournament-winner: entrant selector */}
        {selectedTournament && !setsLoading && sets.length > 0 && marketType === 1 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              <Trophy size={12} className="mr-1 inline" />
              Elegí un jugador para crear su mercado
            </label>
            <p className="mb-3 text-[11px] text-zinc-500">
              Cada jugador genera un mercado independiente. Si elegís a un jugador, crearás el mercado de tipo: <strong>"¿Ganará el torneo?" (Sí/No)</strong>.
            </p>
            {entrants.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                No hay jugadores conocidos todavía.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {entrants.map((name) => {
                  const isSelected = selectedEntrant === name
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setSelectedEntrant(name); setError(null) }}
                      disabled={isPending}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-violet-500 bg-violet-500/10 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-[11px] text-zinc-500">¿Ganará el torneo?</span>
                      </div>
                      {isSelected ? (
                        <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          Seleccionado
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-300">
                          Crear mercado Sí/No
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Liquidity */}
        {(selectedSet || selectedEntrant) && (
          <div>
            <label htmlFor="seed-liquidity" className="mb-1 block text-xs font-medium text-zinc-400">
              Liquidez inicial (USDC, mínimo 100)
            </label>
            <input
              id="seed-liquidity"
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
        )}

        {/* Preview */}
        {selectedTournament && (selectedSet || selectedEntrant) && (
          <MarketPreview
            tournament={selectedTournament}
            marketType={marketType}
            outcomeRef={outcomeRef}
            liquidity={Number(seedLiquidity || 0)}
          />
        )}

        {/* Warning */}
        {(selectedSet || selectedEntrant) && (
          <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
            <p className="text-[11px] text-amber-200/80">Este mercado queda grabado on-chain de forma inmutable. Si los datos son incorrectos, cualquier wallet puede desafiar el mercado y perderás el bono de creación.</p>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

        {(selectedSet || selectedEntrant) && (
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
        )}
      </form>
    </div>
  )
}
