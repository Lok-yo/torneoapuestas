export interface SupportedEventMapping {
  game_id: string
  format_id: string
}

export interface ResolvableEvent {
  id: string
  slug?: string
  name: string
  startAt?: number | null
  videogame?: { id: number }
  phases?: Array<{ id: string; name: string }> | { nodes?: Array<{ id: string; name: string }> }
}

export const STARTGG_GAME_TO_GG_GAME: Record<number, SupportedEventMapping> = {
  1386: { game_id: 'ssbu', format_id: '00000000-0000-0000-0000-000000000001' },
  1: { game_id: 'melee', format_id: '00000000-0000-0000-0000-000000000002' },
  43868: { game_id: 'sf6', format_id: '00000000-0000-0000-0000-000000000003' },
  62790: { game_id: 'fatal-fury', format_id: '00000000-0000-0000-0000-000000000004' },
  49783: { game_id: 'tekken8', format_id: '00000000-0000-0000-0000-000000000005' },
  53945: { game_id: 'roa2', format_id: '00000000-0000-0000-0000-000000000006' },
}

export function resolveSupportedEvent(
  events: ResolvableEvent[] | null | undefined,
  requestedSlug?: string,
): { event: ResolvableEvent; mapping: SupportedEventMapping } | null {
  const supported = (events ?? [])
    .map((event) => ({ event, mapping: event.videogame ? STARTGG_GAME_TO_GG_GAME[event.videogame.id] : undefined }))
    .filter((candidate): candidate is { event: ResolvableEvent; mapping: SupportedEventMapping } => Boolean(candidate.mapping))

  if (requestedSlug) {
    return supported.find(({ event }) => event.slug === requestedSlug) ?? null
  }

  return supported.sort((a, b) => Number(a.event.id) - Number(b.event.id) || a.event.name.localeCompare(b.event.name))[0] ?? null
}
