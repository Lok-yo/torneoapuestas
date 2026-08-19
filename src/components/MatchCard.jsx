import { Link } from 'react-router-dom'
import { Trophy, TrendingUp } from 'lucide-react'

const STATE_LABEL = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
}

const STATE_STYLE = {
  PENDING: 'bg-zinc-800 text-zinc-400',
  IN_PROGRESS: 'bg-amber-950/40 text-amber-400',
  COMPLETED: 'bg-emerald-950/40 text-emerald-400',
  CANCELLED: 'bg-rose-950/30 text-rose-400',
}

export default function MatchCard({ set: s, onSelect, disabled, hasMarket }) {
  const nameA = s.entrant_a_name ?? 'Por definir'
  const nameB = s.entrant_b_name ?? 'Por definir'
  const isCompleted = s.state === 'COMPLETED'
  const winnerId = s.winner_startgg_id
  const aWins = isCompleted && winnerId && s.entrant_a_startgg_id && winnerId === s.entrant_a_startgg_id
  const bWins = isCompleted && winnerId && s.entrant_b_startgg_id && winnerId === s.entrant_b_startgg_id
  const isPending = s.state === 'PENDING' || s.state === 'IN_PROGRESS'

  return (
    <div className="border border-zinc-800 bg-zinc-900/50 transition-colors duration-150">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2.5 py-1.5">
        <span className={`truncate text-[13px] ${aWins ? 'font-semibold text-emerald-400' : 'text-zinc-100'}`}>
          {nameA}
        </span>
        <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] ${STATE_STYLE[s.state]}`}>
          {STATE_LABEL[s.state] ?? s.state}
        </span>
      </div>
      <div className={`flex items-center justify-between border-t border-zinc-800 px-2.5 py-1.5 ${bWins ? '' : ''}`}>
        <span className={`truncate text-[13px] ${bWins ? 'font-semibold text-emerald-400' : 'text-zinc-100'}`}>
          {nameB}
        </span>
        {isCompleted && winnerId && (
          <Trophy size={12} className="shrink-0 text-emerald-500" />
        )}
      </div>
      <div className="border-t border-zinc-800">
        {isCompleted && (
          <div className="px-2 py-1 text-center font-mono text-[10px] uppercase text-zinc-500">
            Finalizado
          </div>
        )}
        {isPending && hasMarket && (
          <Link
            to={`/mercados/${s.startgg_set_id}`}
            className="flex items-center justify-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-center font-mono text-[10px] uppercase text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
          >
            <TrendingUp size={10} />
            Mercado activo
          </Link>
        )}
        {isPending && !hasMarket && !disabled && (
          <button
            type="button"
            onClick={() => onSelect?.(s)}
            className="w-full px-2 py-1 text-center font-mono text-[10px] uppercase text-violet-400 transition-colors duration-150 hover:bg-violet-950/30 hover:text-violet-300"
          >
            Apostar
          </button>
        )}
        {isPending && !hasMarket && disabled && (
          <div className="px-2 py-1 text-center font-mono text-[10px] uppercase text-zinc-600">
            —
          </div>
        )}
      </div>
    </div>
  )
}
