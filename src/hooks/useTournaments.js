// Shared tournament list with module-level singleton cache.
// Avoids duplicate listTournaments() calls across HomePage, RightRail, TournamentsPage.
// Cache is invalidated on mount (stale-while-revalidate pattern: serves cache instantly,
// re-fetches in background to stay fresh).
import { useEffect, useState } from 'react'
import { listTournaments } from '../repositories/tournamentRepository.js'

let cache = null
let inflight = null

function fetchOnce() {
  if (inflight) return inflight
  inflight = listTournaments()
    .then((data) => {
      cache = data
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

// Seed the cache on first import (fire-and-forget). Swallow the rejection
// here: an unconfigured backend must not surface as an unhandled
// pageerror. The hook's useEffect still observes success/error.
if (!cache && !inflight) fetchOnce().catch(() => {})

/**
 * @returns {{ status: 'loading'|'ready'|'error', data: import('../repositories/tournamentRepository.js').Tournament[]|null, error: import('../lib/errors.js').AppError|null }}
 */
export function useTournaments() {
  const [state, setState] = useState(() => ({
    status: cache ? 'ready' : 'loading',
    data: cache,
    error: null,
  }))

  useEffect(() => {
    let cancelled = false

    if (cache) {
      setState({ status: 'ready', data: cache, error: null })
    }

    fetchOnce()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
