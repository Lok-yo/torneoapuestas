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
  DRAFT: 'border-[#3a4438] text-[#8a9080]',
  REGISTRATION_OPEN: 'border-[#3a5a30] text-[#8dff4a]',
  REGISTRATION_CLOSED: 'border-[#6a5a20] text-[#c9a227]',
  IN_PROGRESS: 'border-[#8dff4a] text-[#8dff4a]',
  COMPLETED: 'border-[#3a4438] text-[#8a9080]',
  CANCELLED: 'border-[#3a4438] text-[#5c6458]',
}

export default function TournamentStatusBadge({ status }) {
  const isLive = status === 'IN_PROGRESS'
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {isLive && <span className="live-pip" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
