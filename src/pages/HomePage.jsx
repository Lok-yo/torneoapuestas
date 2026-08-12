import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { GAMES } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments } from '../repositories/tournamentRepository.js'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import LiveBetTicker from '../components/LiveBetTicker.jsx'
import { useAsync } from '../lib/useAsync.js'

export default function HomePage() {
  const { status, profile } = useSession()
  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const { status: featuredStatus, data: allTournaments } = useAsync(() => listTournaments(), [])
  const featuredTournaments = allTournaments?.slice(0, 3) ?? []

  return (
    <div className="flex flex-col gap-14">
      <section className="flex flex-col items-start gap-4 rounded-3xl border border-zinc-800 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-950 p-8 sm:p-12 shadow-2xl">
        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
          Torneos competitivos
        </span>
        <h1 className="max-w-2xl text-3xl font-bold text-zinc-50 sm:text-5xl">
          Organiza torneos de lucha y sigue el ranking oficial
        </h1>
        <p className="max-w-xl text-zinc-400">
          Smash Ultimate, Melee, Street Fighter 6, Fatal Fury: City of the Wolves, Tekken 8 y Rivals
          of Aether II. Registro, brackets, resultados oficiales y rating por jugador.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/torneos"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold !text-white shadow-lg shadow-violet-500/25 hover:bg-violet-500 transition"
          >
            Ver torneos <ArrowRight size={16} />
          </Link>
          {!isAuthenticated && (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-5 py-2.5 text-sm font-semibold !text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition"
            >
              Continuar con Google
            </Link>
          )}
        </div>
      </section>

      <LiveBetTicker />

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Juegos</h2>
        <div className="flex flex-wrap gap-2">
          {GAMES.map((game) => (
            <Link key={game.id} to={`/torneos?juego=${game.id}`}>
              <GameTag game={game} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Torneos destacados</h2>
          <Link to="/torneos" className="text-sm text-zinc-400 hover:text-zinc-200">
            Ver todos
          </Link>
        </div>

        {featuredStatus === 'loading' && (
          <p className="py-6 text-center text-sm text-zinc-500">Cargando torneos…</p>
        )}

        {featuredStatus === 'error' && (
          <p className="py-6 text-center text-sm text-rose-400">No pudimos cargar los torneos destacados ahora mismo.</p>
        )}

        {featuredStatus === 'ready' && featuredTournaments.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">Todavía no hay torneos publicados.</p>
        )}

        {featuredStatus === 'ready' && featuredTournaments.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredTournaments.map((t) => {
              const game = GAMES.find((g) => g.id === t.game_id)
              return (
                <Link
                  key={t.id}
                  to={`/torneos/${t.id}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div className="flex items-center justify-between">
                    {game && <GameTag game={game} />}
                    <TournamentStatusBadge status={t.status} />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-50 group-hover:text-white">{t.name}</h3>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
