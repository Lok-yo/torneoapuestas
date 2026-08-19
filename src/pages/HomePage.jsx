import { Link } from 'react-router-dom'
import { GAMES } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { listMarkets } from '../repositories/marketRepository.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import GameCover from '../components/GameCover.jsx'
import { useAsync } from '../lib/useAsync.js'
import { useTournaments } from '../hooks/useTournaments.js'

const ACTIVE = new Set(['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS'])

export default function HomePage() {
  const { status, profile } = useSession()
  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const { status: boardStatus, data: allTournaments } = useTournaments()
  const { data: markets } = useAsync(() => listMarkets().catch(() => []), [])
  const tournaments = allTournaments ?? []
  const live = tournaments.filter((t) => t.status === 'IN_PROGRESS')
  const featured = live[0] ?? tournaments.find((t) => ACTIVE.has(t.status)) ?? tournaments[0]
  const featuredGame = featured ? GAMES.find((g) => g.id === featured.game_id) : GAMES[2]
  const board = tournaments.slice(0, 8)
  const hotLines = (markets ?? [])
    .filter((m) => m.status === 'OPEN')
    .slice(0, 4)
    .map((m) => {
      const yes = (m.market_outcomes || []).find((o) => /sí|si|yes/i.test(o.label)) || (m.market_outcomes || [])[0]
      const no = (m.market_outcomes || []).find((o) => /^no$/i.test(o.label)) || (m.market_outcomes || [])[1]
      return { id: m.id, question: m.question, yes, no }
    })

  return (
    <div className="flex flex-col gap-8">
      <section className="relative min-h-[320px] overflow-hidden border border-[#1b1f27]">
        {featuredGame?.banner && (
          <img
            src={featuredGame.banner}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#07080b] via-[#07080b]/88 to-[#07080b]/30" />
        <div className="relative flex min-h-[320px] flex-col justify-end gap-4 p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9aa3b2]">
            <span className="text-[#b6ff3a]">Líneas abiertas</span>
            {FEATURE_FLAGS.web3 && <span>Polygon · USDC</span>}
            {live.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[#ff3d7a]">
                <span className="live-pip" /> {live.length} live
              </span>
            )}
          </div>
          <h1 className="max-w-3xl font-display text-5xl uppercase leading-[0.9] text-white md:text-6xl">
            Torneos de Fighting Games y Mercados P2P
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-[#c5cad3]">
            Sigue torneos reales, rankings de jugadores y participa en mercados descentralizados en Polygon con USDC.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/torneos" className="btn-lime px-5 py-2.5">
              Ver líneas
            </Link>
            {featured && (
              <Link to={`/torneos/${featured.id}`} className="btn-ghost px-5 py-2.5">
                Evento en juego
              </Link>
            )}
            {!isAuthenticated && (
              <Link to="/login" className="btn-ghost px-5 py-2.5">
                Continuar con Google
              </Link>
            )}
            {FEATURE_FLAGS.web3 && (
              <Link to="/mercados/nuevo" className="btn-ghost px-5 py-2.5">
                Crear Mercado
              </Link>
            )}
          </div>
        </div>
      </section>

      {hotLines.length > 0 && (
        <section className="panel">
          <div className="flex items-center justify-between border-b border-[#1b1f27] px-4 py-3">
            <p className="kicker">Hot</p>
            <span className="font-mono text-[11px] text-[#6b7380]">{hotLines.length} abiertas</span>
          </div>
          <ul>
            {hotLines.map((line) => (
              <li key={line.id} className="border-b border-[#151922] last:border-0">
                <Link to={`/mercados/${line.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#10131a]">
                  <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">{line.question}</p>
                  {line.yes && (
                    <span className="odds-btn">SÍ {Math.round(Number(line.yes.price) * 100)}</span>
                  )}
                  {line.no && (
                    <span className="odds-btn odds-no">NO {Math.round(Number(line.no.price) * 100)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-3xl uppercase text-white">Juegos</h2>
          <span className="text-[11px] uppercase tracking-wider text-[#6b7380]">{GAMES.length} títulos</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {GAMES.map((game) => {
            const count = tournaments.filter((t) => t.game_id === game.id).length
            const liveCount = tournaments.filter((t) => t.game_id === game.id && t.status === 'IN_PROGRESS').length
            return (
              <Link
                key={game.id}
                to={`/torneos?juego=${game.id}`}
                className="group relative block overflow-hidden border border-[#1b1f27] hover:border-[#b6ff3a]"
              >
                <GameCover game={game} className="aspect-[2/3] w-full" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2">
                  <p className="font-display text-[18px] uppercase leading-none text-white">{game.shortName}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#b6ff3a]">
                    {boardStatus === 'ready' ? count : '—'} ev.
                    {liveCount > 0 ? ` · ${liveCount} live` : ''}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between border-b border-[#1b1f27] px-4 py-3">
          <h2 className="font-display text-3xl uppercase text-white">Cartelera</h2>
          <Link to="/torneos" className="text-[11px] font-bold uppercase tracking-wider text-[#b6ff3a]">
            Ver todos
          </Link>
        </div>

        {boardStatus === 'loading' && <p className="px-4 py-10 text-center text-[13px] text-[#6b7380]">Cargando torneos…</p>}
        {boardStatus === 'error' && (
          <p className="px-4 py-10 text-center text-[13px] text-[#ff3d7a]">No pudimos cargar los torneos destacados ahora mismo.</p>
        )}
        {boardStatus === 'ready' && board.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-[#6b7380]">Todavía no hay torneos publicados.</p>
        )}

        {boardStatus === 'ready' && board.length > 0 && (
          <ul>
            {board.map((t) => {
              const game = GAMES.find((g) => g.id === t.game_id)
              return (
                <li key={t.id} className="border-b border-[#151922] last:border-0">
                  <Link to={`/torneos/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#10131a]">
                    {game && <GameCover game={game} className="h-14 w-10 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-white">{t.name}</p>
                      <p className="text-[12px] text-[#6b7380]">{game?.shortName ?? t.game_id}</p>
                    </div>
                    <TournamentStatusBadge status={t.status} />
                    <span className="odds-btn hidden sm:inline-block">ABRIR</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
