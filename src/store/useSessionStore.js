// Sesión de usuario simulada (sin backend todavía). Persiste en localStorage
// para que el login/onboarding sobreviva a un refresh mientras se navega el
// prototipo. En una etapa futura esto se reemplaza por Supabase Auth (Google)
// manteniendo la misma forma de `user`.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPlayerByUsername } from '../data/players.js'

export const useSessionStore = create(
  persist(
    (set, get) => ({
      user: null, // { id, email, name, username }

      // Placeholder de "Continuar con Google" — todavía no hay OAuth real.
      loginWithGoogleMock: () => {
        set({
          user: {
            id: 'me',
            email: 'jugador.demo@gmail.com',
            name: 'Jugador Invitado',
            username: null,
          },
        })
      },

      isUsernameTaken: (username) => Boolean(getPlayerByUsername(username)),

      setUsername: (username) => {
        const { user } = get()
        if (!user) return
        set({ user: { ...user, username } })
      },

      logout: () => set({ user: null }),
    }),
    { name: 'torneoapuestas-session' },
  ),
)
