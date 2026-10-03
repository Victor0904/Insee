/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Tirage gaussien centré réduit (Box-Muller). */
export function gaussian(rand: () => number): number {
  let u = 0
  while (u === 0) u = rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Multiplicateur lognormal d'espérance 1. */
export function lognormalFactor(rand: () => number, sigma: number): number {
  if (sigma <= 0) return 1
  return Math.exp(sigma * gaussian(rand) - (sigma * sigma) / 2)
}
