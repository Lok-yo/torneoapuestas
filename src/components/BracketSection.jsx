import { Clock, GitBranch } from 'lucide-react'
import MatchCard from './MatchCard.jsx'

export default function BracketSection({ tournamentId, sets, onSelectSet, disabled }) {
  if (!sets || sets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Clock size={20} className="text-zinc-500" />
        <p className="text-[13px] text-zinc-400">Aún no hay TOP 8 — el poller trae más cada 60s</p>
      </div>
    )
  }

  // start.gg assigns positive rounds to Winners Bracket and negative rounds to Losers Bracket
  const winnersRounds = [...new Set(sets.filter((s) => s.round > 0).map((s) => s.round))].sort((a, b) => a - b)
  const losersRounds = [...new Set(sets.filter((s) => s.round < 0).map((s) => s.round))].sort((a, b) => b - a) // Reverse sort for visual rendering (e.g. -1 is Losers Finals, -2 is Losers Semis)

  // Labels for Winners
  const getWinnersLabel = (roundIndex, totalRounds) => {
    if (roundIndex === totalRounds - 1) return 'Grand Finals'
    if (roundIndex === totalRounds - 2) return 'Winners Finals'
    if (roundIndex === totalRounds - 3) return 'Winners Semis'
    if (roundIndex === totalRounds - 4) return 'Winners Quarters'
    return `Winners R${roundIndex + 1}`
  }

  // Labels for Losers (roundIndex 0 is Losers Finals)
  const getLosersLabel = (roundIndex) => {
    if (roundIndex === 0) return 'Losers Finals'
    if (roundIndex === 1) return 'Losers Semis'
    if (roundIndex === 2) return 'Losers Quarters'
    if (roundIndex === 3) return 'Losers R8'
    return `Losers R${roundIndex + 1}`
  }

  return (
    <div className="overflow-x-auto border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        <GitBranch size={14} className="text-rose-700" />
        Árbol del bracket
      </div>
      {(winnersRounds.length > 2 || losersRounds.length > 2) && (
        <p className="mb-2 text-center text-[11px] text-zinc-600 sm:hidden">← Desliza →</p>
      )}
      
      <div className="flex flex-col gap-10">
        {/* Winners Bracket */}
        <div className="flex min-w-max snap-x snap-mandatory gap-6">
          {winnersRounds.map((round, idx) => {
            // Explicit, stable order by startgg_set_id (permanent, assigned
            // once when start.gg creates the set) — NOT by `slot`, which
            // the poller recomputes fresh every poll from whatever order
            // that cycle's API response happened to return (sets.ts
            // nextSlot()), so it can reshuffle sibling matches within a
            // round as other matches change state. This doesn't reproduce
            // start.gg's own seed-pairing layout (no seed data is stored),
            // but it guarantees a match never visually moves once it has
            // rendered in a position.
            const matchSets = sets.filter((s) => s.round === round).sort((a, b) => a.startgg_set_id - b.startgg_set_id)
            return (
              <div key={round} className="flex min-w-[220px] snap-start flex-col">
                <h2 className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  {getWinnersLabel(idx, winnersRounds.length)}
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

        {/* Losers Bracket */}
        {losersRounds.length > 0 && (
          <div className="flex min-w-max snap-x snap-mandatory gap-6">
            {losersRounds.map((round, idx) => {
              // Explicit, stable order by startgg_set_id (permanent, assigned
            // once when start.gg creates the set) — NOT by `slot`, which
            // the poller recomputes fresh every poll from whatever order
            // that cycle's API response happened to return (sets.ts
            // nextSlot()), so it can reshuffle sibling matches within a
            // round as other matches change state. This doesn't reproduce
            // start.gg's own seed-pairing layout (no seed data is stored),
            // but it guarantees a match never visually moves once it has
            // rendered in a position.
            const matchSets = sets.filter((s) => s.round === round).sort((a, b) => a.startgg_set_id - b.startgg_set_id)
              return (
                <div key={round} className="flex min-w-[220px] snap-start flex-col">
                  <h2 className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    {getLosersLabel(idx)}
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
        )}
      </div>
    </div>
  )
}
