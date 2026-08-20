import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import LeftSidebar from '../components/LeftSidebar.jsx'
import RightRail from '../components/RightRail.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

export default function MainLayout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="shell">
      <div className="shell-top">
        <Navbar onToggleNav={() => setNavOpen((v) => !v)} />
      </div>

      <aside className={`shell-left ${navOpen ? 'open' : ''}`}>
        <LeftSidebar onNavigate={() => setNavOpen(false)} />
      </aside>

      <main className="shell-main">
        <div className="px-5 py-7 md:px-8 md:py-9">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      <div className="shell-right">
        <RightRail />
      </div>

      {navOpen && (
        <button
          type="button"
          aria-label="Cerrar menú / Close menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
    </div>
  )
}
