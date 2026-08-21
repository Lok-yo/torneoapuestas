export interface StartggUrlParts {
  tournamentSlug: string
  eventSlug?: string
}

const STARTGG_HOSTS = new Set(['start.gg', 'www.start.gg'])
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * Parses the canonical start.gg tournament URL family without resolving the
 * event. Bracket paths are deliberately ignored because their IDs are not
 * needed by the import boundary.
 */
export function parseStartggUrl(value: string): StartggUrlParts | null {
  let url: URL
  try {
    url = new URL(String(value).trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || !STARTGG_HOSTS.has(url.hostname.toLowerCase())) return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'tournament' || !segments[1] || !SLUG.test(segments[1])) return null
  if (segments.length === 2) return { tournamentSlug: segments[1] }

  if (segments[2] !== 'event' || !segments[3] || !SLUG.test(segments[3])) return null
  if (segments.length === 4) return { tournamentSlug: segments[1], eventSlug: segments[3] }
  if (segments[4] !== 'brackets' || segments.length < 6) return null

  return { tournamentSlug: segments[1], eventSlug: segments[3] }
}
