// Real backend-wired tournament list: async loading/error/empty states,
// no fixture fallback. See tasks.md 3.13 and tournament-operations spec
// "Public projection and closed perimeter".
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getGameById, GAMES } from '../data/games.js'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import GameCover from '../components/GameCover.jsx'
import { useTournaments } from '../hooks/useTournaments.js'
import { addTournamentByLink } from '../repositories/tournamentRepository.js'
import { Trophy, Plus, Link as LinkIcon, Loader2 } from 'lucide-react'

export default function TournamentsPage() {
  const { status, data, error } = useTournaments()
  const [params, setParams] = useSearchParams()
  const gameFilter = params.get('juego')
  const q = (params.get('q') || '').trim().toLowerCase()

  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const mainTournaments = data?.main ?? []
  const finishedTournaments = data?.finished ?? []

  const rows = useMemo(() => {
    let list = mainTournaments
    if (gameFilter) list = list.filter((t) => t.game_id === gameFilter)
    if (q) list = list.filter((t) => String(t.name || '').toLowerCase().includes(q))
    return list
  }, [mainTournaments, gameFilter, q])

  const finishedRows = useMemo(() => {
    let list = finishedTournaments
    if (gameFilter) list = list.filter((t) => t.game_id === gameFilter)
    if (q) list = list.filter((t) => String(t.name || '').toLowerCase().includes(q))
    return list
  }, [finishedTournaments, gameFilter, q])

  async function handleImport(e) {
    e.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setFeedback(null)

    try {
      const res = await addTournamentByLink(url.trim())
      if (res?.status === 'already_tracked') {
        setFeedback({ type: 'info', text: 'Este torneo ya está registrado y en seguimiento.' })
      } else {
        setFeedback({ type: 'success', text: '¡Torneo agregado a la lista global en vivo!' })
        setUrl('')
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'No se pudo agregar el torneo por enlace.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker">Torneos en vivo</p>
          <h1 className="mt-1 font-display text-4xl font-bold text-white">Torneos</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Torneos oficiales de Fighting Games y seguimiento start.gg.</p>
        </div>

        <form onSubmit={handleImport} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-[280px]">
            <LinkIcon size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://start.gg/tournament/..."
              aria-label="Enlace del torneo en start.gg"
              className="w-full border border-zinc-700 bg-zinc-900/80 py-2 pl-9 pr-3 text-[12px] text-white placeholder-zinc-500 focus:border-lime focus:outline-none"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="flex items-center justify-center gap-1.5 bg-lime px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[#0a0c08] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Plus size={14} aria-hidden="true" />}
            Agregar torneo
          </button>
        </form>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`border px-4 py-2.5 text-[12px] ${
            feedback.type === 'success'
              ? 'border-lime/40 bg-lime/10 text-lime'
              : feedback.type === 'info'
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                : 'border-hot/40 bg-hot/10 text-hot'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={!gameFilter}
          onClick={() => {
            params.delete('juego')
            setParams(params)
          }}
          className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
            !gameFilter ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-400'
          }`}
        >
          Todos
        </button>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={gameFilter === g.id}
            onClick={() => {
              params.set('juego', g.id)
              setParams(params)
            }}
            className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
              gameFilter === g.id ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-400'
            }`}
          >
            {g.shortName}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div role="status" aria-live="polite" className="border border-zinc-800/60">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-zinc-800/40 px-4 py-3.5 last:border-0">
              <div className="h-14 w-10 animate-pulse bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="py-10 text-center text-[13px] text-hot">
          No pudimos cargar los torneos ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/60">
            <Trophy size={24} aria-hidden="true" className="text-zinc-500" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-zinc-300">Aún no hay torneos en vivo</p>
            <p className="mt-1 text-[13px] text-zinc-500">Puedes agregar un enlace de start.gg arriba para dar seguimiento.</p>
          </div>
          <Link to="/" className="btn-lime mt-2 px-5 py-2.5 text-[12px]">
            Volver al inicio
          </Link>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="border border-zinc-800/60">
          <div className="hidden grid-cols-[56px_1fr_auto_auto] gap-3 border-b border-zinc-800/60 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:grid">
            <span>Juego</span>
            <span>Evento</span>
            <span>Estado</span>
            <span className="text-right">Línea</span>
          </div>
          {rows.map((tournament) => {
            const game = getGameById(tournament.game_id)
            return (
              <Link
                key={tournament.id}
                to={`/torneos/${tournament.id}`}
                className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-zinc-800/60 px-4 py-3.5 last:border-0 bg-zinc-900/20 transition-colors duration-150 hover:bg-zinc-800/60 sm:grid-cols-[56px_1fr_auto_auto]"
              >
                {game ? <GameCover game={game} className="h-14 w-10" /> : <span />}
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] text-zinc-100">{tournament.name}</h2>
                  <p className="text-[12px] text-zinc-500">{game?.shortName ?? tournament.game_id}</p>
                </div>
                <div className="hidden sm:block">
                  <TournamentStatusBadge status={tournament.status} />
                </div>
                <span className="odds-btn hidden sm:inline-block">Abrir</span>
              </Link>
            )
          })}
        </div>
      )}

      {status === 'ready' && finishedRows.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase text-zinc-400">Finalizados</h2>
          <div className="border border-zinc-800/60 opacity-80">
            <div className="hidden grid-cols-[56px_1fr_auto_auto] gap-3 border-b border-zinc-800/60 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:grid">
              <span>Juego</span>
              <span>Evento</span>
              <span>Estado</span>
              <span className="text-right">Línea</span>
            </div>
            {finishedRows.map((tournament) => {
              const game = getGameById(tournament.game_id)
              return (
                <Link
                  key={tournament.id}
                  to={`/torneos/${tournament.id}`}
                  className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-zinc-800/60 px-4 py-3.5 last:border-0 bg-zinc-950/40 transition-colors duration-150 hover:bg-zinc-800/40 sm:grid-cols-[56px_1fr_auto_auto]"
                >
                  {game ? <GameCover game={game} className="h-14 w-10" /> : <span />}
                  <div className="min-w-0">
                    <h2 className="truncate text-[14px] text-zinc-300">{tournament.name}</h2>
                    <p className="text-[12px] text-zinc-500">{game?.shortName ?? tournament.game_id}</p>
                  </div>
                  <div className="hidden sm:block">
                    <TournamentStatusBadge status={tournament.status} />
                  </div>
                  <span className="odds-btn hidden sm:inline-block">Ver</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
