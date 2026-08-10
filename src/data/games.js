// Catálogo de los juegos soportados por la plataforma.
// Nota: se usan íconos genéricos (lucide-react) y no logos oficiales de los
// juegos para evitar el uso de marcas registradas de terceros.
import { Swords, Zap, Flame, Moon, Shield, Wind } from 'lucide-react'

export const GAMES = [
  {
    id: 'ssbu',
    name: 'Super Smash Bros. Ultimate',
    shortName: 'Smash Ultimate',
    accentColor: '#a78bfa',
    icon: Swords,
  },
  {
    id: 'melee',
    name: 'Super Smash Bros. Melee',
    shortName: 'Melee',
    accentColor: '#34d399',
    icon: Zap,
  },
  {
    id: 'sf6',
    name: 'Street Fighter 6',
    shortName: 'SF6',
    accentColor: '#fb923c',
    icon: Flame,
  },
  {
    id: 'fatal-fury',
    name: 'Fatal Fury: City of the Wolves',
    shortName: 'Fatal Fury',
    accentColor: '#fbbf24',
    icon: Moon,
  },
  {
    id: 'tekken8',
    name: 'Tekken 8',
    shortName: 'Tekken 8',
    accentColor: '#38bdf8',
    icon: Shield,
  },
  {
    id: 'roa2',
    name: 'Rivals of Aether II',
    shortName: 'Rivals of Aether II',
    accentColor: '#f472b6',
    icon: Wind,
  },
]

export const getGameById = (id) => GAMES.find((g) => g.id === id)
