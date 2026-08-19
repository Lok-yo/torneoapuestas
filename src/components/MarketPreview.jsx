import { Calendar, Gamepad2, BarChart3, Droplets } from 'lucide-react'
import { getGameById } from '../data/games.js'
import { formatUsdc } from '../lib/web3/format.js'

const MARKET_TYPE_LABEL = {
  0: 'Por partido',
  1: 'Ganador del torneo',
}

export default function MarketPreview({ tournament, marketType, outcomeRef, liquidity }) {
  if (!tournament) return null

  const game = getGameById(tournament.game_id)
  const eventDate = tournament.created_at
    ? new Date(tournament.created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Vista previa del mercado
      </h3>

      <div className="flex flex-col gap-2.5 text-sm">
        <div className="flex items-center gap-2 text-zinc-300">
          <Gamepad2 size={14} className="shrink-0 text-zinc-500" />
          <span className="font-medium text-zinc-100">{tournament.name}</span>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <Calendar size={14} className="shrink-0" />
          <span>{game?.name ?? tournament.game_id} · {eventDate}</span>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <BarChart3 size={14} className="shrink-0" />
          <span>{MARKET_TYPE_LABEL[marketType] ?? 'Por partido'}</span>
        </div>

        {outcomeRef && (
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="ml-[22px]">Ref: <span className="text-zinc-200">{outcomeRef}</span></span>
          </div>
        )}

        <div className="flex items-center gap-2 text-zinc-400">
          <Droplets size={14} className="shrink-0 text-emerald-500" />
          <span>Liquidez: <span className="font-medium text-emerald-400">{Number(liquidity || 0).toFixed(2)} USDC</span></span>
        </div>
      </div>
    </div>
  )
}
