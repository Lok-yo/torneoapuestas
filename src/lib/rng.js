// Generador pseudo-aleatorio con semilla fija, usado solo para que los datos
// mock (torneos, partidos, mercados) sean deterministas entre recargas en vez
// de cambiar random en cada refresh.
export function createRng(seed = 1) {
  let s = seed
  return function next() {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min
}
