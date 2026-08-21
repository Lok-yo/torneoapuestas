import { Link } from 'react-router-dom'
import { Trophy, TrendingUp } from 'lucide-react'
import { useMarket } from '../lib/web3/hooks.js'
import { useMemo } from 'react'
import { matchQuestionId } from '../lib/web3/questionId.js'
import { useI18n } from '../i18n/I18nProvider.jsx'


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

export default function MatchCard({ set: s, onSelect, disabled, hasMarket: dbHasMarket }) {
  const { t } = useI18n()
  const questionId = useMemo(() => {
    if (!s.startgg_event_id || !s.startgg_set_id) return null
    return matchQuestionId(s.startgg_event_id, s.startgg_set_id)
  }, [s.startgg_event_id, s.startgg_set_id])

  const { market } = useMarket(questionId)
  const isMarketOnchain = market && market.state !== 0
  const hasMarket = dbHasMarket || isMarketOnchain

  const nameA = s.entrant_a_name ?? 'Por definir'
  const nameB = s.entrant_b_name ?? 'Por definir'
  const isCompleted = s.state === 'COMPLETED'
  // public_tournament_sets_view deliberately hides winner_startgg_id and
  // entrant ids (0025_tournament_sets_and_market_set_key.sql) — it only
  // exposes winner_name, so the winner must be matched by name here, not id.
  const winnerName = s.winner_name
  const aWins = isCompleted && Boolean(winnerName) && winnerName === s.entrant_a_name
  const bWins = isCompleted && Boolean(winnerName) && winnerName === s.entrant_b_name
  const isPending = s.state === 'PENDING' || s.state === 'IN_PROGRESS'
  const canBet = !!s.entrant_a_name && !!s.entrant_b_name && s.entrant_a_name !== "Por definir" && s.entrant_b_name !== "Por definir" && isPending && !hasMarket && !disabled

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
        {isCompleted && Boolean(winnerName) && (
          <Trophy size={12} className="shrink-0 text-emerald-500" />
        )}
      </div>
      <div className="border-t border-zinc-800">
        {isCompleted && (
          <div className="px-2 py-1 text-center font-mono text-[10px] uppercase text-zinc-500">
            {winnerName ? `Ganó ${winnerName}` : 'Finalizado'}
          </div>
        )}
        {isPending && hasMarket && (
          <Link
            to={`/mercados/${questionId}`}
            className="flex items-center justify-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-center font-mono text-[10px] uppercase text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
          >
            <TrendingUp size={10} />
            Mercado activo
          </Link>
        )}
        {canBet && (
          <button
            type="button"
            onClick={() => onSelect?.(s)}
            className="w-full px-2 py-1 text-center font-mono text-[10px] uppercase text-violet-400 transition-colors duration-150 hover:bg-violet-950/30 hover:text-violet-300"
          >
            Apostar
          </button>
        )}
        {isPending && !hasMarket && !canBet && (
          <div
            title={t('match.waitingPlayers')}
            className="px-2 py-1 text-center font-mono text-[10px] uppercase text-zinc-600"
          >
            {disabled ? '—' : t('match.waitingPlayers')}
          </div>
        )}
      </div>
    </div>
  )
}
