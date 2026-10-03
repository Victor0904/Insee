import { AGES, COMP_BIRTHS, COMP_DEATHS, COMP_EXT, COMP_IN, COMP_OUT, N_COMP, SEXES, type ModelData, type SimResult } from './types'

/**
 * Ratios des besoins estimés (voir DECISIONS.md). Ce sont des ordres de grandeur pédagogiques,
 * pas des normes officielles : ils sont affichés « estimés » dans l'interface.
 */
export const RATIOS = {
  /** Âges de la scolarité en école maternelle et élémentaire (3 à 10 ans au 1er janvier). */
  schoolAges: [3, 10] as const,
  /** Une place par enfant scolarisé (taux de scolarisation ≈ 100 % de 3 à 10 ans). */
  schoolRate: 1,
  /**
   * Part des 85 ans et plus vivant en établissement pour personnes âgées : ordre de grandeur
   * (≈ 1 sur 5) retenu comme hypothèse de jeu, à rapprocher des enquêtes EHPA de la DREES.
   */
  ehpadAge: 85,
  ehpadRate: 0.2,
  /** Âge d'ouverture des droits pris en référence pour la « pression retraites ». */
  retirementAge: 64,
}

export interface Indicators {
  population: number
  density: number // hab./km² (NaN si superficie inconnue)
  medianAge: number
  meanAge: number
  shareUnder20: number
  share65plus: number
  /** Seniors (65 ans et plus) pour 100 personnes de 20 à 64 ans. */
  seniorsPer100Workers: number
  /** Actifs potentiels (20-64 ans) par senior (65 ans et plus). */
  workersPerSenior: number
  workingAge: number // 20-64
  /** Personnes en âge de retraite (64+) pour 100 personnes de 20 à 63 ans. */
  pensionPressure: number
  births: number
  deaths: number
  naturalBalance: number
  migrationBalance: number
  internalIn: number
  internalOut: number
  external: number
  schoolPlaces: number
  ehpadPlaces: number
}

/** Pyramide agrégée (hommes, femmes) d'un ensemble de départements pour une année. */
export function pyramid(res: SimResult, deps: number[], yi: number): [Float64Array, Float64Array] {
  const men = new Float64Array(AGES)
  const women = new Float64Array(AGES)
  const block = res.nDep * SEXES * AGES
  for (const d of deps) {
    const base = yi * block + d * SEXES * AGES
    for (let a = 0; a < AGES; a++) {
      men[a] += res.pop[base + a]
      women[a] += res.pop[base + AGES + a]
    }
  }
  return [men, women]
}

export function totalPop(res: SimResult, deps: number[], yi: number): number {
  const block = res.nDep * SEXES * AGES
  let t = 0
  for (const d of deps) {
    const base = yi * block + d * SEXES * AGES
    for (let i = 0; i < SEXES * AGES; i++) t += res.pop[base + i]
  }
  return t
}

export function compSum(res: SimResult, deps: number[], yi: number, c: number): number {
  let t = 0
  for (const d of deps) t += res.comps[(yi * res.nDep + d) * N_COMP + c]
  return t
}

function medianOf(byAge: Float64Array, total: number): number {
  let cum = 0
  for (let a = 0; a < AGES; a++) {
    if (cum + byAge[a] >= total / 2) return a + (total / 2 - cum) / (byAge[a] || 1)
    cum += byAge[a]
  }
  return AGES - 1
}

export function computeIndicators(data: ModelData, res: SimResult, deps: number[], yi: number): Indicators {
  const [m, f] = pyramid(res, deps, yi)
  const byAge = new Float64Array(AGES)
  let total = 0
  let ageSum = 0
  for (let a = 0; a < AGES; a++) {
    byAge[a] = m[a] + f[a]
    total += byAge[a]
    ageSum += byAge[a] * (a + 0.5)
  }
  const sumRange = (lo: number, hi: number) => {
    let t = 0
    for (let a = lo; a <= Math.min(hi, AGES - 1); a++) t += byAge[a]
    return t
  }
  const under20 = sumRange(0, 19)
  const working = sumRange(20, 64)
  const seniors = sumRange(65, 100)
  const retirees = sumRange(RATIOS.retirementAge, 100)
  const contributors = sumRange(20, RATIOS.retirementAge - 1)
  let area = 0
  for (const d of deps) area += data.areaKm2[d]

  // les composantes de l'année yi décrivent le passage yi → yi+1 ; pour l'année courante on
  // montre celles de l'année écoulée (yi-1 → yi), sauf en première année.
  const ci = Math.max(0, yi - 1)
  const births = compSum(res, deps, ci, COMP_BIRTHS)
  const deaths = compSum(res, deps, ci, COMP_DEATHS)
  const internalIn = compSum(res, deps, ci, COMP_IN)
  const internalOut = compSum(res, deps, ci, COMP_OUT)
  const external = compSum(res, deps, ci, COMP_EXT)

  return {
    population: total,
    density: area > 0 ? total / area : NaN,
    medianAge: medianOf(byAge, total),
    meanAge: total ? ageSum / total : 0,
    shareUnder20: total ? under20 / total : 0,
    share65plus: total ? seniors / total : 0,
    seniorsPer100Workers: working ? (100 * seniors) / working : 0,
    workersPerSenior: seniors ? working / seniors : 0,
    workingAge: working,
    pensionPressure: contributors ? (100 * retirees) / contributors : 0,
    births,
    deaths,
    naturalBalance: births - deaths,
    migrationBalance: internalIn - internalOut + external,
    internalIn,
    internalOut,
    external,
    schoolPlaces: sumRange(RATIOS.schoolAges[0], RATIOS.schoolAges[1]) * RATIOS.schoolRate,
    ehpadPlaces: sumRange(RATIOS.ehpadAge, 100) * RATIOS.ehpadRate,
  }
}

/** Série annuelle d'un indicateur pour une zone. */
export function series(
  data: ModelData,
  res: SimResult,
  deps: number[],
  pick: (i: Indicators) => number,
): Float64Array {
  const out = new Float64Array(res.nYears)
  for (let yi = 0; yi < res.nYears; yi++) out[yi] = pick(computeIndicators(data, res, deps, yi))
  return out
}
