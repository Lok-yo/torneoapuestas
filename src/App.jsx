import { useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import OnboardingUsernamePage from './pages/OnboardingUsernamePage.jsx'
import TournamentsPage from './pages/TournamentsPage.jsx'
import TournamentDetailPage from './pages/TournamentDetailPage.jsx'
import OrganizerPanelPage from './pages/OrganizerPanelPage.jsx'
import AdminPanelPage from './pages/AdminPanelPage.jsx'
import MarketDetailPage from './pages/MarketDetailPage.jsx'
import LeaderboardPage from './pages/LeaderboardPage.jsx'
import PlayerProfilePage from './pages/PlayerProfilePage.jsx'
import WalletPage from './pages/WalletPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import { useSession } from './auth/SessionProvider.jsx'

// A real Google OAuth sign-in returns the browser to "/", not wherever the
// user clicked "sign in" from (unlike the old mock flow's inline
// navigate('/onboarding')). This redirects any authenticated session with
// no username yet to onboarding, from any route. See authenticated-identity
// spec "Successful sign-in" and design.md sequence diagram.
function OnboardingRedirect() {
  const { status, profile } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== 'authenticated') return
    if (profile?.username) return
    if (location.pathname === '/onboarding') return
    navigate('/onboarding', { replace: true })
  }, [status, profile, location.pathname, navigate])

  return null
}

export default function App() {
  return (
    <>
      <OnboardingRedirect />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="onboarding" element={<OnboardingUsernamePage />} />
          <Route path="torneos" element={<TournamentsPage />} />
          <Route path="torneos/:id" element={<TournamentDetailPage />} />
          <Route path="ranking" element={<LeaderboardPage />} />
          <Route path="jugadores/:username" element={<PlayerProfilePage />} />
          {/* Legacy demo-only prediction-market/wallet UI (simulated TCRED
              credits, never real financial state — proposal.md "Out of
              Scope"). The route element resolves to NotFoundPage outside
              FEATURE_FLAGS.demoFinancialUI, which is hard-forced off in
              every production build — the routes stay registered so
              RequireAuth's own auth-guard behavior on /wallet (unrelated
              to this flag) is unchanged. See tasks.md 5.6/5.7 and
              legacy-migration-controls spec "Legacy identity and
              financial isolation". */}
          <Route path="mercados/:id" element={<MarketDetailPage />} />
          <Route element={<RequireAuth />}>
            <Route path="wallet" element={<WalletPage />} />
          </Route>
          {/* First real production usage of RequireAuth's role prop (built
              in Phase 2, unused by any route until now) — see tasks.md
              6.3 and OrganizerPanelPage.jsx. Client-side gate only; the
              underlying RPCs remain the real authority.
              KNOWN GAP (validator finding, not fixed — see tasks.md Batch 5
              log / follow-up notes): no migration ever grants the
              'organizer' role value (only 0002_admin_bootstrap.sql grants
              'admin', to one fixed email), so this route is currently
              unreachable through any documented flow even for a real
              tournament owner. Not a security hole — the RPC's ownership
              check is the real authority regardless — but a real
              provisioning gap. Do not "fix" by removing this role prop:
              e2e/session-routing.spec.js's threat-matrix test ("an
              authenticated user without the organizer role... redirected
              to /") specifically depends on this gate existing. The real
              fix is an organizer-role-granting mechanism, not gate removal. */}
          <Route element={<RequireAuth role="organizer" />}>
            <Route path="organizador" element={<OrganizerPanelPage />} />
          </Route>
          <Route element={<RequireAuth role="admin" />}>
            <Route path="admin" element={<AdminPanelPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
