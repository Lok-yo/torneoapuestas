import { Link } from 'react-router-dom'
import { getMarketById } from '../data/markets.js'
import { useWalletStore } from '../store/useWalletStore.js'
import { formatTCRED, formatPercent } from '../lib/format.js'

export default function PositionRow({ position }) {
  const market = getMarketById(position.marketId)
  const closePosition = useWalletStore((s) => s.closePosition)
  if (!market) return null

  const currentPrice = position.side === 'YES' ? market.yesPrice : 1 - market.yesPrice
  const currentValue = position.shares * currentPrice
  const cost = position.shares * position.avgPrice
  const pnl = currentValue - cost

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link to={`/mercados/${market.id}`} className="font-medium text-zinc-100 hover:underline">
          {market.question}
        </Link>
        <p className="text-xs text-zinc-500">
          {position.side === 'YES' ? 'Sí' : 'No'} · {position.shares.toFixed(2)} shares · precio prom.{' '}
          {formatPercent(position.avgPrice)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-medium text-zinc-100">{formatTCRED(currentValue)}</p>
          <p className={`text-xs ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnl >= 0 ? '+' : ''}
            {formatTCRED(pnl)}
          </p>
        </div>
        {!market.resolved && (
          <button
            type="button"
            onClick={() => closePosition(market, position.side)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500"
          >
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}
