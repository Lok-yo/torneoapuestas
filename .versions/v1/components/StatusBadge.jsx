import { STATUS_LABEL } from '../lib/format.js'

const STYLES = {
  upcoming: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  live: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  finished: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-400',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.finished}`}
    >
      {status === 'live' && <span className="live-pip" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
