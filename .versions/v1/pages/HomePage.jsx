import { Link } from 'react-router-dom'
import { GAMES } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import GameCover from '../components/GameCover.jsx'
import { useAsync } from '../lib/useAsync.js'

const ACTIVE = new Set(['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS'])

export default function HomePage() {
  const { status, profile } = useSession()
  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const { status: boardStatus, data: allTournaments } = useAsync(() => listTournaments(), [])
  const tournaments = allTournaments ?? []
  const live = tournaments.filter((t) => t.status === 'IN_PROGRESS')
  const featured = live[0] ?? tournaments.find((t) => ACTIVE.has(t.status)) ?? tournaments[0]
  const featuredGame = featured ? GAMES.find((g) => g.id === featured.game_id) : GAMES[2]
  const board = tournaments.slice(0, 8)

  return (
    <div className="flex flex-col gap-5">
      <section className="relative min-h-[220px] overflow-hidden border border-[#243028] bg-[#0c1410]">
        {featuredGame?.banner && (
          <img
            src={featuredGame.banner}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#070c09] via-[#070c09]/80 to-transparent" />
        <div className="relative flex min-h-[220px] flex-col justify-end gap-3 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#c9a227]">
            <span className="border border-[#c9a227]/50 px-1.5 py-0.5">Mesa principal</span>
            {FEATURE_FLAGS.web3 && <span className="border border-[#3a4a30] px-1.5 py-0.5 text-[#8dff4a]">On-chain</span>}
            {live.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[#8dff4a]">
                <span className="live-pip" /> {live.length} en vivo
              </span>
            )}
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none text-[#f3ead0] md:text-5xl">
            {FEATURE_FLAGS.web3 ? 'Líneas FGC · USDC' : 'Líneas de lucha'}
          </h1>
          <p className="max-w-xl text-[13px] text-[#b8b09a]">
            {featured
              ? `Evento de apertura: ${featured.name}`
              : 'Smash, SF6, Tekken, Fatal Fury y Rivals. Cartelera, brackets y ranking oficial.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/torneos" className="bg-[#c9a227] px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-[#141208]">
              Abrir cartelera
            </Link>
            {featured && (
              <Link
                to={`/torneos/${featured.id}`}
                className="border border-[#3a4a30] px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-[#ddd6c4]"
              >
                Ir al evento
              </Link>
            )}
            {!isAuthenticated && (
              <Link to="/login" className="border border-[#3a4a30] px-4 py-2 text-[12px] font-semibold text-[#ddd6c4]">
                Continuar con Google
              </Link>
            )}
            {FEATURE_FLAGS.web3 && (
              <Link to="/mercados/nuevo" className="border border-[#3a4a30] px-4 py-2 text-[12px] font-semibold text-[#c9a227]">
                Crear Mercado
              </Link>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="font-display text-[15px] font-bold tracking-[0.14em] text-[#9aa090]">SALAS</h2>
          <span className="font-mono text-[10px] text-[#5c6458]">{GAMES.length} títulos</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {GAMES.map((game) => {
            const count = tournaments.filter((t) => t.game_id === game.id).length
            const liveCount = tournaments.filter((t) => t.game_id === game.id && t.status === 'IN_PROGRESS').length
            return (
              <Link key={game.id} to={`/torneos?juego=${game.id}`} className="group relative block overflow-hidden border border-[#243028]">
                <GameCover game={game} className="aspect-[2/3] w-full" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-1.5">
                  <p className="font-display text-[12px] font-bold uppercase leading-none text-white">{game.shortName}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#c9a227]">
                    {boardStatus === 'ready' ? count : '—'} ev.
                    {liveCount > 0 ? ` · ${liveCount} live` : ''}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="border border-[#243028] bg-[#0c1410]">
        <div className="flex items-center justify-between border-b border-[#243028] px-3 py-2">
          <h2 className="font-display text-[15px] font-bold tracking-[0.14em] text-[#f0e6c8]">CARTELERA</h2>
          <Link to="/torneos" className="text-[11px] uppercase tracking-wider text-[#c9a227]">
            Ver todos
          </Link>
        </div>

        {boardStatus === 'loading' && <p className="px-3 py-8 text-center text-[13px] text-[#6d7566]">Cargando torneos…</p>}
        {boardStatus === 'error' && (
          <p className="px-3 py-8 text-center text-[13px] text-[#ff4d5a]">No pudimos cargar los torneos destacados ahora mismo.</p>
        )}
        {boardStatus === 'ready' && board.length === 0 && (
          <p className="px-3 py-8 text-center text-[13px] text-[#6d7566]">Todavía no hay torneos publicados.</p>
        )}

        {boardStatus === 'ready' && board.length > 0 && (
          <ul>
            {board.map((t) => {
              const game = GAMES.find((g) => g.id === t.game_id)
              return (
                <li key={t.id} className="border-b border-[#1b251e] last:border-0">
                  <Link to={`/torneos/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#121a14]">
                    {game && <GameCover game={game} className="h-12 w-9 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#f0e6c8]">{t.name}</p>
                      <p className="text-[11px] text-[#6d7566]">{game?.shortName ?? t.game_id}</p>
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
