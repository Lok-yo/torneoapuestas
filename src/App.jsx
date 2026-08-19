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
import CreateMarketPage from './pages/CreateMarketPage.jsx'
import { useSession } from './auth/SessionProvider.jsx'
import { FEATURE_FLAGS } from './config/featureFlags.js'

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
          {/* Prediction-market detail route — gated behind FEATURE_FLAGS.web3.
              When off (default), resolves to NotFoundPage mirroring the
              /mercados/nuevo gate pattern. The route element internally
              delegates to OnchainMarketDetailView when web3 is on. See
              design.md Decision 7 and tasks.md 11.5. */}
          <Route path="mercados/:id" element={FEATURE_FLAGS.web3 ? <MarketDetailPage /> : <NotFoundPage />} />
          {/* Permissionless on-chain market creation (proposal.md "market
              creation: permissionless") — gated behind FEATURE_FLAGS.web3.
              Registered but resolves to NotFoundPage while off (default). */}
          <Route path="mercados/nuevo" element={FEATURE_FLAGS.web3 ? <CreateMarketPage /> : <NotFoundPage />} />
          {/* Wallet route — gated behind FEATURE_FLAGS.web3.
              When off, resolves to NotFoundPage (no legacy TCRED UI). */}
          <Route element={<RequireAuth />}>
            <Route path="wallet" element={FEATURE_FLAGS.web3 ? <WalletPage /> : <NotFoundPage />} />
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
