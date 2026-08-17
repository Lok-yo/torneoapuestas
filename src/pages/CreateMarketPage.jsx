// Permissionless market creation — proposal.md "market creation:
// permissionless: Any wallet may create a market on any ingested
// start.gg event — no admin approval gate". Registered in App.jsx only
// behind FEATURE_FLAGS.web3 (resolves to NotFoundPage while off). See
// onchain-prediction-markets spec "Permissionless Market Creation
// Eligibility" / "Permissionless Market Creation Guardrail (Creation
// Bond)".
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, AlertCircle } from 'lucide-react'
import { keccak256, encodeAbiParameters } from 'viem'
import { useWalletConnect, useCreateMarket } from '../lib/web3/hooks.js'
import { parseUsdc, formatUsdc } from '../lib/web3/format.js'
import { MARKET_FACTORY_ADDRESS } from '../lib/web3/contracts.js'

const CREATION_BOND_USDC = 25n * 1_000_000n
const MIN_LIQUIDITY_USDC = 100n * 1_000_000n

export default function CreateMarketPage() {
  const navigate = useNavigate()
  const { isConnected, connectors, connect, connectError } = useWalletConnect()
  const { createMarket, isPending } = useCreateMarket()

  const [startggEventId, setStartggEventId] = useState('')
  const [marketType, setMarketType] = useState(0)
  const [outcomeRef, setOutcomeRef] = useState('')
  const [seedLiquidity, setSeedLiquidity] = useState('100')
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!startggEventId || !outcomeRef) {
      setError('Completá el evento de start.gg y la referencia del resultado.')
      return
    }

    const seed = parseUsdc(seedLiquidity)
    if (seed < MIN_LIQUIDITY_USDC) {
      setError(`La liquidez inicial debe ser al menos ${formatUsdc(MIN_LIQUIDITY_USDC)} USDC.`)
      return
    }

    try {
      // questionId = keccak256(abi.encode(startggEventId, marketType,
      // outcomeRef)) — design.md Decision 3, matches
      // contracts/src/MarketFactory.sol createMarket NatSpec exactly.
      const questionId = keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
          [BigInt(startggEventId), marketType, keccak256(new TextEncoder().encode(outcomeRef))],
        ),
      )

      const eventStartsAt = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const totalApproval = CREATION_BOND_USDC + seed

      await createMarket({
        questionId,
        startggEventId: BigInt(startggEventId),
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
            Conectar con {connector.name}
          </button>
        ))}
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
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-2">
        <PlusCircle className="text-violet-400" size={20} />
        <h1 className="text-xl font-semibold text-zinc-50">Crear mercado</h1>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Cualquier wallet puede crear un mercado sobre un evento de start.gg ya ingerido. Se requiere un bono
        reembolsable de {formatUsdc(CREATION_BOND_USDC)} USDC, más al menos {formatUsdc(MIN_LIQUIDITY_USDC)} USDC de
        liquidez inicial. Otra wallet puede desafiar el mercado como duplicado o malformado dentro de la ventana de
        creación.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div>
          <label htmlFor="startgg-event-id" className="mb-1 block text-xs font-medium text-zinc-400">
            ID de evento start.gg
          </label>
          <input
            id="startgg-event-id"
            type="number"
            value={startggEventId}
            onChange={(e) => setStartggEventId(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
          />
        </div>

        <div>
          <label htmlFor="market-type" className="mb-1 block text-xs font-medium text-zinc-400">
            Tipo de mercado
          </label>
          <select
            id="market-type"
            value={marketType}
            onChange={(e) => setMarketType(Number(e.target.value))}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
          >
            <option value={0}>Por partido (per-match)</option>
            <option value={1}>Ganador del torneo (per-tournament-winner)</option>
          </select>
        </div>

        <div>
          <label htmlFor="outcome-ref" className="mb-1 block text-xs font-medium text-zinc-400">
            Referencia del resultado (jugador/partido)
          </label>
          <input
            id="outcome-ref"
            type="text"
            value={outcomeRef}
            onChange={(e) => setOutcomeRef(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
          />
        </div>

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
            onChange={(e) => setSeedLiquidity(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
          />
        </div>

        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {isPending ? 'Confirmando…' : 'Crear mercado'}
        </button>
      </form>
    </div>
  )
}
