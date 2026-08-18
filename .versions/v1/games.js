// Catálogo de juegos. Las portadas se referencian desde CDNs públicos
// que ya las sirven (Steam store para títulos de PC; Wikimedia para
// entradas de catálogo que start.gg también lista). No se rehostean
// archivos de Nintendo ni assets de marca en /public.
import { Swords, Zap, Flame, Moon, Shield, Wind } from 'lucide-react'

export const GAMES = [
  {
    id: 'ssbu',
    name: 'Super Smash Bros. Ultimate',
    shortName: 'Smash Ultimate',
    accentColor: '#d4b45a',
    icon: Swords,
    startggId: 1386,
    cover: 'https://upload.wikimedia.org/wikipedia/en/5/50/Super_Smash_Bros._Ultimate.jpg',
    banner: 'https://upload.wikimedia.org/wikipedia/en/5/50/Super_Smash_Bros._Ultimate.jpg',
  },
  {
    id: 'melee',
    name: 'Super Smash Bros. Melee',
    shortName: 'Melee',
    accentColor: '#7cff6b',
    icon: Zap,
    startggId: 1,
    cover: 'https://upload.wikimedia.org/wikipedia/en/7/75/Super_Smash_Bros_Melee_box_art.png',
    banner: 'https://upload.wikimedia.org/wikipedia/en/7/75/Super_Smash_Bros_Melee_box_art.png',
  },
  {
    id: 'sf6',
    name: 'Street Fighter 6',
    shortName: 'SF6',
    accentColor: '#e4572e',
    icon: Flame,
    startggId: 43868,
    steamAppId: 1364780,
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1364780/library_600x900.jpg',
    banner: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1364780/header.jpg',
  },
  {
    id: 'fatal-fury',
    name: 'Fatal Fury: City of the Wolves',
    shortName: 'Fatal Fury',
    accentColor: '#e0b04a',
    icon: Moon,
    startggId: 62790,
    steamAppId: 2496460,
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2496460/library_600x900.jpg',
    banner: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2496460/header.jpg',
  },
  {
    id: 'tekken8',
    name: 'Tekken 8',
    shortName: 'Tekken 8',
    accentColor: '#4aa3d9',
    icon: Shield,
    startggId: 49783,
    steamAppId: 1778820,
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1778820/library_600x900.jpg',
    banner: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1778820/header.jpg',
  },
  {
    id: 'roa2',
    name: 'Rivals of Aether II',
    shortName: 'Rivals II',
    accentColor: '#c45ad0',
    icon: Wind,
    startggId: 53945,
    steamAppId: 2217000,
    cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2217000/library_600x900.jpg',
    banner: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2217000/header.jpg',
  },
]

export const getGameById = (id) => GAMES.find((g) => g.id === id)
