import { computeIndicators, totalPop } from './indicators'
import type { ModelData, ReferenceJson, SimResult } from './types'

export interface ValidationReport {
  /** Indice d'évolution (base 1 en 2025) : moteur contre projections Insee 2026 (France entière, même périmètre). */
  national: { year: number; engine: number; official: number; gapPts: number }[]
  /** Part des 65 ans et plus (points de %). */
  seniors: { year: number; engine: number; official: number; gapPts: number }[]
  maxNationalGapPts: number
  maxSeniorGapPts: number
  /** Projection à 1 an comparée à l'estimation Insee au 1/1/2026, par département. */
  oneYear: { meanAbsPct: number; maxAbsPct: number; worst: string }
  /** Parts des départements dans la population métropolitaine, comparées à Omphale 2022. */
  omphale: { year: number; meanAbsPct: number; maxAbsPct: number; worst: string }[]
}

/** Mesure l'écart entre le scénario de référence du moteur et les références officielles. */
export function validate(data: ModelData, ref: SimResult, reference: ReferenceJson): ValidationReport {
  const all = data.departments.map((_, i) => i)
  const y0 = data.startYear
  const nat = reference.national
  const base = totalPop(ref, all, 0)
  const offBase = nat.total[nat.years.indexOf(y0)]

  const national = nat.years
    .filter((y) => y > y0 && y <= data.endYear && (y % 5 === 0 || y === y0 + 1))
    .map((year) => {
      const engine = totalPop(ref, all, year - y0) / base
      const official = nat.total[nat.years.indexOf(year)] / offBase
      return { year, engine, official, gapPts: 100 * (engine - official) }
    })
  const seniors = nat.years
    .filter((y) => y >= y0 && y % 10 === 0)
    .map((year) => {
      const engine = computeIndicators(data, ref, all, year - y0).share65plus
      const official = nat.share65plus[nat.years.indexOf(year)]
      return { year, engine, official, gapPts: 100 * (engine - official) }
    })

  let sum = 0
  let max = 0
  let worst = ''
  data.departments.forEach((d, i) => {
    const e = Math.abs(totalPop(ref, [i], 2026 - y0) / reference.estimate2026.pop[i] - 1)
    sum += e
    if (e > max) {
      max = e
      worst = d.name
    }
  })
  const oneYear = { meanAbsPct: (100 * sum) / data.nDep, maxAbsPct: 100 * max, worst }

  const omphale = reference.omphale.years
    .filter((y) => y >= 2030)
    .map((year) => {
      const oi = reference.omphale.years.indexOf(year)
      const oTot = reference.omphale.pop.reduce((s, p) => s + p[oi], 0)
      const eTot = totalPop(ref, all, year - y0)
      let s2 = 0
      let m2 = 0
      let w2 = ''
      data.departments.forEach((d, i) => {
        const e = Math.abs(totalPop(ref, [i], year - y0) / eTot / (reference.omphale.pop[i][oi] / oTot) - 1)
        s2 += e
        if (e > m2) {
          m2 = e
          w2 = d.name
        }
      })
      return { year, meanAbsPct: (100 * s2) / data.nDep, maxAbsPct: 100 * m2, worst: w2 }
    })

  return {
    national,
    seniors,
    maxNationalGapPts: Math.max(...national.map((r) => Math.abs(r.gapPts))),
    maxSeniorGapPts: Math.max(...seniors.map((r) => Math.abs(r.gapPts))),
    oneYear,
    omphale,
  }
}

/** Seuils au-delà desquels le test de validation échoue (voir DECISIONS.md). */
export const VALIDATION_THRESHOLDS = {
  maxNationalGapPts: 1.5,
  maxSeniorGapPts: 1.5,
  oneYearMeanAbsPct: 0.3,
  oneYearMaxAbsPct: 1,
  omphaleMeanAbsPct: { 2030: 2.5, 2050: 5, 2070: 7 } as Record<number, number>,
}
