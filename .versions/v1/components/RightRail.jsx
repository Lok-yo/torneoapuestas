import { Link } from 'react-router-dom'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { listMarkets } from '../repositories/marketRepository.js'
import { useAsync } from '../lib/useAsync.js'
import { getGameById } from '../data/games.js'
import GameCover from './GameCover.jsx'
import TournamentStatusBadge from './TournamentStatusBadge.jsx'

const LIVE = new Set(['IN_PROGRESS', 'REGISTRATION_OPEN'])

export default function RightRail() {
  const { data: tournaments } = useAsync(() => listTournaments(), [])
  const { data: markets } = useAsync(() => listMarkets().catch(() => []), [])

  const live = (tournaments ?? []).filter((t) => LIVE.has(t.status)).slice(0, 5)
  const tape = (markets ?? [])
    .flatMap((m) =>
      (m.market_outcomes || []).slice(0, 2).map((o) => ({
        id: `${m.id}-${o.id}`,
        marketId: m.id,
        question: m.question,
        label: o.label,
        price: o.price ? Math.round(Number(o.price) * 100) : 50,
      })),
    )
    .slice(0, 8)

  return (
    <aside className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#243028] px-3 py-2">
        <span className="flex items-center gap-2 font-display text-[13px] font-bold tracking-[0.12em] text-[#f0e6c8]">
          <span className="live-pip" /> EN PISTA
        </span>
        <span className="font-mono text-[10px] text-[#6d7566]">{live.length} live</span>
      </div>

      <div className="flex flex-col">
        {live.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-[#6d7566]">No hay eventos en curso ahora.</p>
        )}
        {live.map((t) => {
          const game = getGameById(t.game_id)
          return (
            <Link
              key={t.id}
              to={`/torneos/${t.id}`}
              className="flex gap-2 border-b border-[#1b251e] px-3 py-2 hover:bg-[#121a14]"
            >
              {game && <GameCover game={game} className="h-12 w-9 shrink-0" />}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-[#ddd6c4]">{t.name}</p>
                <div className="mt-1">
                  <TournamentStatusBadge status={t.status} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {tape.length > 0 && (
        <div className="border-t border-[#243028]">
          <p className="px-3 py-2 font-display text-[11px] font-bold tracking-[0.14em] text-[#6d7566]">
            CINTA
          </p>
          <div className="flex flex-col">
            {tape.map((row) => (
              <Link
                key={row.id}
                to={`/mercados/${row.marketId}`}
                className="flex items-start justify-between gap-2 border-b border-[#1b251e] px-3 py-2 hover:bg-[#121a14]"
              >
                <span className="line-clamp-2 text-[11px] text-[#b8b09a]">{row.question}</span>
                <span className="odds-btn shrink-0">
                  {row.label} {row.price}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-auto border-t border-[#243028] px-3 py-3 text-[10px] leading-relaxed text-[#5c6458]">
        Crédito de mesa <span className="font-mono text-[#9a7a2a]">TCRED</span> — ficha de simulación, sin valor
        de cambio.
      </p>
    </aside>
  )
}
