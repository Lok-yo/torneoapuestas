export interface UnionWorkItem {
  event_id: number
  source: 'mx' | 'tracked' | 'both'
  needsEventFetch: boolean
}

export function buildUnionWork(
  mxEvents: Array<{ startgg_event_id: number; [key: string]: unknown }>,
  trackedEvents: Array<{ startgg_event_id: number; [key: string]: unknown }>,
): UnionWorkItem[] {
  const mxMap = new Map<number, { startgg_event_id: number }>()
  for (const event of mxEvents) {
    if (event.startgg_event_id) {
      mxMap.set(event.startgg_event_id, event)
    }
  }

  const trackedMap = new Map<number, { startgg_event_id: number }>()
  for (const event of trackedEvents) {
    if (event.startgg_event_id) {
      trackedMap.set(event.startgg_event_id, event)
    }
  }

  const allIds = new Set<number>([...mxMap.keys(), ...trackedMap.keys()])
  const result: UnionWorkItem[] = []

  for (const event_id of allIds) {
    const inMx = mxMap.has(event_id)
    const inTracked = trackedMap.has(event_id)

    let source: 'mx' | 'tracked' | 'both' = 'mx'
    if (inMx && inTracked) {
      source = 'both'
    } else if (inTracked) {
      source = 'tracked'
    }

    result.push({
      event_id,
      source,
      needsEventFetch: !inMx,
    })
  }

  return result
}
