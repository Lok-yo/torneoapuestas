import { Clock, GitBranch } from 'lucide-react'
import MatchCard from './MatchCard.jsx'

const ROUND_LABEL = {
  1: 'Grand Finals',
  2: 'Winners Finals',
  3: 'Losers Finals',
  4: 'Winners Semis',
  5: 'Losers Semis',
  6: 'Round of 8',
  7: 'Quarterfinals',
}

export default function BracketSection({ tournamentId, sets, onSelectSet, disabled }) {
  if (!sets || sets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Clock size={20} className="text-zinc-500" />
        <p className="text-[13px] text-zinc-400">Aún no hay TOP 8 — el poller trae más cada 60s</p>
      </div>
    )
  }

  const rounds = [...new Set(sets.map((s) => s.round))].sort((a, b) => a - b)

  return (
    <div className="overflow-x-auto border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        <GitBranch size={14} className="text-rose-700" />
        Árbol del bracket
      </div>
      {rounds.length > 2 && (
        <p className="mb-2 text-center text-[11px] text-zinc-600 sm:hidden">← Desliza →</p>
      )}
      <div className="flex min-w-max snap-x snap-mandatory gap-6">
        {rounds.map((round) => {
          const matchSets = sets.filter((s) => s.round === round)
          return (
            <div key={round} className="flex min-w-[220px] snap-start flex-col">
              <h2 className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                {ROUND_LABEL[round] ?? `Ronda ${round}`}
              </h2>
              <div
                className="flex flex-1 flex-col justify-around gap-4"
                style={{ minHeight: `${Math.max(matchSets.length, 1) * 88}px` }}
              >
                {matchSets.map((s) => (
                  <MatchCard
                    key={s.startgg_set_id}
                    set={s}
                    onSelect={onSelectSet}
                    disabled={disabled}
                    hasMarket={s.has_market}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
