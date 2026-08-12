// Reusable async data-fetching hook. Replaces the duplicated
// useState + useEffect + cancelled-flag boilerplate that appeared
// in every page component. See project review Phase 1, item 1.
import { useEffect, useState } from 'react'
import { toAppError } from './errors.js'

/**
 * @template T
 * @param {() => Promise<T>} asyncFn - The async function to execute.
 * @param {unknown[]} deps - Dependency array; the effect re-runs when these change.
 * @returns {{ status: 'loading'|'ready'|'error', data: T|null, error: import('./errors.js').AppError|null }}
 */
export function useAsync(asyncFn, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    asyncFn()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch((rawError) => {
        if (!cancelled) setState({ status: 'error', data: null, error: toAppError(rawError) })
      })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
