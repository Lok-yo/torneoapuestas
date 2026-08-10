// Helpers de formato compartidos por toda la app.

export function formatTCRED(amount) {
  const n = Number(amount) || 0
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} TCRED`
}

export function formatPercent(fraction) {
  return `${Math.round((Number(fraction) || 0) * 100)}%`
}

export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const STATUS_LABEL = {
  upcoming: 'Próximo',
  live: 'En vivo',
  finished: 'Finalizado',
}
