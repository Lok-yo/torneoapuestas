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
  DRAFT: 'border-[#3a1218] text-[#8a8680]',
  REGISTRATION_OPEN: 'border-[#b6ff3a]/50 text-[#b6ff3a]',
  REGISTRATION_CLOSED: 'border-[#3a1218] text-[#8a8680]',
  IN_PROGRESS: 'border-[#ff3d7a] text-[#ff3d7a]',
  COMPLETED: 'border-[#3a1218] text-[#8a8680]',
  CANCELLED: 'border-[#3a1218] text-[#5a5650]',
}

export default function TournamentStatusBadge({ status }) {
  const isLive = status === 'IN_PROGRESS'
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[status] ?? STYLES.DRAFT}`}
    >
      {isLive && <span className="live-pip" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
