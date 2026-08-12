import { useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import OnboardingUsernamePage from './pages/OnboardingUsernamePage.jsx'
import TournamentsPage from './pages/TournamentsPage.jsx'
import TournamentDetailPage from './pages/TournamentDetailPage.jsx'
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
          <Route path="mercados/:id" element={<MarketDetailPage />} />
          <Route path="ranking" element={<LeaderboardPage />} />
          <Route path="jugadores/:username" element={<PlayerProfilePage />} />
          <Route element={<RequireAuth />}>
            <Route path="wallet" element={<WalletPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
