// Real Supabase-backed identity: session bootstrap, refresh, expiry, and
// sign-out with explicit states. See authenticated-identity spec "Google
// authentication and session lifecycle" and tasks.md 2.1/2.8.
//
// States: 'loading' | 'anonymous' | 'authenticated' | 'expired'.
// 'expired' is the "recoverable authentication state" the spec requires
// when the provider/session/bootstrap is unavailable — protected
// commands are denied in this state exactly like 'anonymous'.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  bootstrapSession,
  getCurrentSession,
  onAuthStateChange,
  signInWithGoogle,
  signOut as signOutRepo,
} from '../repositories/sessionRepository.js'
import { toAppError } from '../lib/errors.js'

const SessionContext = createContext(null)

const INITIAL_STATE = {
  status: 'loading',
  session: null,
  profile: null,
  roles: [],
  error: null,
}

export function SessionProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE)

  const bootstrap = useCallback(async (session) => {
    if (!session) {
      setState({ status: 'anonymous', session: null, profile: null, roles: [], error: null })
      return
    }

    try {
      const { profile, roles } = await bootstrapSession()
      setState({ status: 'authenticated', session, profile, roles: roles ?? [], error: null })
    } catch (rawError) {
      const error = toAppError(rawError)
      setState({ status: 'expired', session, profile: null, roles: [], error })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getCurrentSession()
      .then((session) => {
        if (!cancelled) bootstrap(session)
      })
      .catch((rawError) => {
        if (!cancelled) {
          const error = toAppError(rawError)
          setState({ status: 'expired', session: null, profile: null, roles: [], error })
        }
      })

    const unsubscribe = onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        setState({ status: 'anonymous', session: null, profile: null, roles: [], error: null })
        return
      }
      bootstrap(session)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = useCallback(async () => {
    await signOutRepo()
    setState({ status: 'anonymous', session: null, profile: null, roles: [], error: null })
  }, [])

  const refresh = useCallback(() => bootstrap(state.session), [bootstrap, state.session])

  const value = useMemo(
    () => ({
      ...state,
      signInWithGoogle,
      signOut,
      refresh,
      hasRole: (role) => state.roles.includes(role),
    }),
    [state, signOut, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
