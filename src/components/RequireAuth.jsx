import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '../store/useSessionStore.js'

export default function RequireAuth() {
  const user = useSessionStore((s) => s.user)
  const location = useLocation()

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!user.username) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
