import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        TorneoApuestas — prototipo. Las apuestas usan TCRED, un crédito simulado sin valor real.
      </footer>
    </div>
  )
}
