import { GitBranch } from 'lucide-react'
import { useAsync } from '../lib/useAsync.js'
import { listTournamentSets } from '../repositories/tournamentRepository.js'
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

export default function BracketSection({ tournamentId, onSelectSet, disabled }) {
  const { status, data: sets, error } = useAsync(() => listTournamentSets(tournamentId), [tournamentId])

  if (status === 'loading') {
    return (
      <div className="flex gap-6 py-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex w-[220px] flex-col gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
            <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          </div>
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p className="py-8 text-center text-[13px] text-rose-400">
        No se pudo cargar el bracket. {error?.message}
      </p>
    )
  }

  if (!sets || sets.length === 0) {
    return <p className="py-8 text-center text-[13px] text-zinc-500">El bracket todavía no fue generado.</p>
  }

  const rounds = [...new Set(sets.map((s) => s.round))].sort((a, b) => a - b)

  return (
    <div className="overflow-x-auto border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        <GitBranch size={14} className="text-rose-700" />
        Árbol del bracket
      </div>
      <div className="flex min-w-max gap-6">
        {rounds.map((round) => {
          const matchSets = sets.filter((s) => s.round === round)
          return (
            <div key={round} className="flex min-w-[220px] flex-col">
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
