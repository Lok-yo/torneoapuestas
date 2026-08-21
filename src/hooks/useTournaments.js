// Shared tournament list with module-level singleton cache and 30s bounded polling.
// Serves cache instantly (stale-while-revalidate), polls every 30s, and returns data
// grouped into { main, finished }.
import { useEffect, useState } from 'react'
import { listTournaments, listFinishedTournaments } from '../repositories/tournamentRepository.js'

let cache = null
let inflight = null

function diffMerge(currentList, newList) {
  if (!currentList) return newList
  if (!newList) return currentList

  const currentMap = new Map(currentList.map((item) => [item.id, item]))
  let changed = currentList.length !== newList.length

  const merged = newList.map((newItem) => {
    const existing = currentMap.get(newItem.id)
    if (!existing) {
      changed = true
      return newItem
    }
    const isDifferent = JSON.stringify(existing) !== JSON.stringify(newItem)
    if (isDifferent) {
      changed = true
      return { ...existing, ...newItem }
    }
    return existing
  })

  return changed ? merged : currentList
}

async function fetchBoth() {
  const [main, finished] = await Promise.all([listTournaments(), listFinishedTournaments()])
  const nextData = { main: main ?? [], finished: finished ?? [] }
  if (!cache) {
    cache = nextData
  } else {
    cache = {
      main: diffMerge(cache.main, nextData.main),
      finished: diffMerge(cache.finished, nextData.finished),
    }
  }
  return cache
}

function fetchOnce() {
  if (inflight) return inflight
  inflight = fetchBoth().finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * @returns {{ status: 'loading'|'ready'|'error', data: { main: Array<object>, finished: Array<object> }|null, error: any }}
 */
export function useTournaments() {
  const [state, setState] = useState(() => ({
    status: cache ? 'ready' : 'loading',
    data: cache,
    error: null,
  }))

  useEffect(() => {
    let cancelled = false

    const doFetch = () => {
      fetchOnce()
        .then((data) => {
          if (!cancelled) setState({ status: 'ready', data, error: null })
        })
        .catch((error) => {
          if (!cancelled) {
            setState((prev) => ({
              status: prev.data ? 'ready' : 'error',
              data: prev.data,
              error,
            }))
          }
        })
    }

    doFetch()

    const interval = setInterval(doFetch, 30_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return state
}
