// Status badge for the real (server-authorized) tournament lifecycle
// enum. Deliberately separate from StatusBadge.jsx, which renders the
// legacy mock 'upcoming'|'live'|'finished' shape still used by HomePage/
// MarketDetailPage until their consumers migrate (see legacy-migration-
// controls spec) — the two status vocabularies are not interchangeable.
const STATUS_LABEL = {
  DRAFT: 'Borrador',
  REGISTRATION_OPEN: 'Inscripciones abiertas',
  REGISTRATION_CLOSED: 'Roster cerrado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
}

const STYLES = {
  DRAFT: 'border-zinc-600/40 bg-zinc-600/15 text-zinc-400',
  REGISTRATION_OPEN: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  REGISTRATION_CLOSED: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  IN_PROGRESS: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  COMPLETED: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-400',
  CANCELLED: 'border-zinc-700/40 bg-zinc-700/15 text-zinc-500',
}

export default function TournamentStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
