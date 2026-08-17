// Route guard for the real Supabase-backed identity. Blocks rendering
// until the session status is known, then enforces authentication,
// onboarding completion, and optional role/ownership requirements
// client-side for UX — the database grants/RLS remain the actual
// authority for every protected command (see design.md "Browser writes
// vs commands"). See authenticated-identity spec "Unauthorized command"
// and design.md threat matrix "Application routes/session redirects".
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider.jsx'

/**
 * @param {{ role?: string, ownerId?: string }} [props]
 *   role: required role grant (checked client-side for UX; server still
 *     authorizes independently). ownerId: if provided, only the session
 *     user matching this id may proceed.
 */
export default function RequireAuth({ role, ownerId } = {}) {
  const { status, session, profile, hasRole } = useSession()
  const location = useLocation()

  // Bootstrap in flight — render nothing rather than flashing a wrong
  // redirect while the session state is still unknown.
  if (status === 'loading') return null

  if (status === 'anonymous' || status === 'expired' || !session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!profile?.username) {
    return <Navigate to="/onboarding" replace />
  }

  if (role && !hasRole(role)) {
    return <Navigate to="/" replace />
  }

  if (ownerId && session.user?.id !== ownerId) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
