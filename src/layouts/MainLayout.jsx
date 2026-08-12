import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

export default function MainLayout() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-violet-500 selection:text-white">
      {/* Radial ambient background lighting */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-violet-600/20 blur-[140px]" />
        <div className="absolute top-[40%] -right-[10%] h-[400px] w-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col justify-between">
        <div>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 py-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        <footer className="border-t border-zinc-900/80 bg-zinc-950/60 py-6 text-center text-xs text-zinc-500 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row">
            <p className="font-medium text-zinc-400">
              TorneoApuestas — Plataforma de Torneos de Lucha & Predicciones
            </p>
            <p className="text-[11px] text-zinc-600">
              Las apuestas utilizan <span className="font-semibold text-violet-400">TCRED</span>, un crédito simulado sin valor financiero real.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
