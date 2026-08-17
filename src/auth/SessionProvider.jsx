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
import { getMyWalletLink, linkWallet as linkWalletRepo, unlinkWallet as unlinkWalletRepo } from '../repositories/walletLinkRepository.js'
import { verifySiweSignature } from '../lib/web3/siwe.js'
import { toAppError } from '../lib/errors.js'

const SessionContext = createContext(null)

const INITIAL_STATE = {
  status: 'loading',
  session: null,
  profile: null,
  roles: [],
  error: null,
  // Optional 1:1 SIWE wallet link (wallet-identity spec "Optional 1:1
  // SIWE Linking") — social surfaces only, NEVER required for trading.
  // See design.md Decision 7 / File Changes "SessionProvider.jsx
  // Modified: Optional wallet link".
  walletLink: null,
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
      setState({ status: 'authenticated', session, profile, roles: roles ?? [], error: null, walletLink: null })
      // Non-blocking: an optional social link never gates authentication
      // or any trading action (wallet-identity spec "No Required GG2
      // Account for Trading" / "MUST NOT require this link for any
      // trading action").
      getMyWalletLink()
        .then((walletLink) => setState((prev) => (prev.status === 'authenticated' ? { ...prev, walletLink } : prev)))
        .catch(() => {})
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

  /**
   * Completes the optional SIWE link: verifies the wallet's own
   * signature client-side (only that wallet's private key could produce
   * a signature `verifyMessage` accepts), then persists the link via the
   * 1:1-enforcing `link_wallet` RPC. Never called on any trading path.
   * @param {{address: string, chainId: number, message: string, signature: string}} params
   */
  const linkWallet = useCallback(async ({ address, chainId, message, signature }) => {
    const isValid = await verifySiweSignature({ address, message, signature })
    if (!isValid) {
      throw new Error('La firma de la wallet no es válida.')
    }
    const walletLink = await linkWalletRepo(address, chainId)
    setState((prev) => ({ ...prev, walletLink }))
    return walletLink
  }, [])

  const unlinkWallet = useCallback(async () => {
    await unlinkWalletRepo()
    setState((prev) => ({ ...prev, walletLink: null }))
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      signInWithGoogle,
      signOut,
      refresh,
      linkWallet,
      unlinkWallet,
      hasRole: (role) => state.roles.includes(role),
    }),
    [state, signOut, refresh, linkWallet, unlinkWallet],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
