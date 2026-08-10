import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { useSessionStore } from '../store/useSessionStore.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)
  const loginWithGoogleMock = useSessionStore((s) => s.loginWithGoogleMock)

  useEffect(() => {
    if (user?.username) navigate('/', { replace: true })
    else if (user && !user.username) navigate('/onboarding', { replace: true })
  }, [user, navigate])

  const handleGoogleLogin = () => {
    loginWithGoogleMock()
    navigate('/onboarding')
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
      <Trophy size={32} className="text-violet-400" />
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Ingresá a TorneoApuestas</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Organizá y seguí torneos, apostá TCRED en cada partido.
        </p>
      </div>
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
      >
        Continuar con Google
      </button>
      <p className="text-xs text-zinc-600">
        Login simulado para este prototipo — la integración real de Google OAuth se conecta en la
        próxima etapa (Supabase Auth).
      </p>
    </div>
  )
}
