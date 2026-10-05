import { computeIndicators, totalPop } from '../../engine/indicators'
import type { ModelData, SimResult } from '../../engine/types'
import type { LayerId } from '../../state/appStore'
import { fmtDec1, fmtInt, fmtSigned } from '../../lib/format'

export interface LayerDef {
  id: LayerId
  /** Libellé grand public. */
  label: string
  /** Terme technique, affiché au survol. */
  technical: string
  /** Phrase d'explication courte. */
  explain: string
  kind: 'signed' | 'sequential'
  format: (v: number) => string
}

const pct = (v: number) => `${fmtSigned(100 * v, fmtDec1)} %`

export const LAYERS: LayerDef[] = [
  {
    id: 'delta',
    label: 'Écart avec la référence',
    technical: 'Écart relatif de population au scénario de référence',
    explain: 'Combien d’habitants en plus ou en moins par rapport au futur « sans événement ».',
    kind: 'signed',
    format: pct,
  },
  {
    id: 'growth',
    label: 'Évolution depuis 2025',
    technical: 'Taux de variation de la population depuis le 1er janvier 2025',
    explain: 'Le département gagne-t-il ou perd-il des habitants depuis 2025 ?',
    kind: 'signed',
    format: pct,
  },
  {
    id: 'medianAge',
    label: 'Âge médian',
    technical: 'Âge médian',
    explain: 'La moitié des habitants a moins que cet âge, l’autre moitié plus.',
    kind: 'sequential',
    format: (v) => `${fmtDec1(v)} ans`,
  },
  {
    id: 'seniors',
    label: 'Seniors pour 100 actifs',
    technical: 'Rapport de dépendance des âgés (65 ans et plus / 20-64 ans)',
    explain: 'Nombre de personnes de 65 ans et plus pour 100 personnes de 20 à 64 ans.',
    kind: 'sequential',
    format: (v) => fmtInt(v),
  },
  {
    id: 'migration',
    label: 'Arrivées moins départs',
    technical: 'Taux de solde migratoire (pour 1 000 habitants)',
    explain: 'Personnes arrivées moins personnes parties dans l’année, pour 1 000 habitants.',
    kind: 'signed',
    format: (v) => `${fmtSigned(v, fmtDec1)} ‰`,
  },
  {
    id: 'density',
    label: 'Habitants au km²',
    technical: 'Densité de population',
    explain: 'Nombre d’habitants par kilomètre carré (superficie approchée).',
    kind: 'sequential',
    format: (v) => fmtInt(v),
  },
]

export const layerById = (id: LayerId) => LAYERS.find((l) => l.id === id)!

/** Valeurs d'une couche pour toutes les années : (yi * n + d). */
export function layerMatrix(data: ModelData, baseline: SimResult, result: SimResult, id: LayerId): Float64Array {
  const n = data.nDep
  const Y = result.nYears
  const out = new Float64Array(Y * n)
  for (let d = 0; d < n; d++) {
    const one = [d]
    const p0 = totalPop(result, one, 0)
    for (let yi = 0; yi < Y; yi++) {
      let v: number
      switch (id) {
        case 'growth':
          v = totalPop(result, one, yi) / p0 - 1
          break
        case 'delta':
          v = totalPop(result, one, yi) / totalPop(baseline, one, yi) - 1
          break
        case 'density':
          v = totalPop(result, one, yi) / data.areaKm2[d]
          break
        default: {
          const ind = computeIndicators(data, result, one, yi)
          v =
            id === 'medianAge'
              ? ind.medianAge
              : id === 'seniors'
                ? ind.seniorsPer100Workers
                : yi === 0
                  ? NaN
                  : (1000 * ind.migrationBalance) / ind.population
        }
      }
      out[yi * n + d] = v
    }
  }
  if (id === 'migration') for (let d = 0; d < n; d++) out[d] = out[n + d] // 2025 : on montre l'année 2025→2026
  return out
}

export interface ClassScale {
  thresholds: number[] // n-1 seuils pour n classes
  colors: string[]
  classOf: (v: number) => number
  /** Libellés de légende par classe. */
  labels: string[]
}

const NICE = [1, 2, 2.5, 5]
function niceStep(x: number): number {
  if (!(x > 0)) return 0.001
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  for (const k of NICE) if (k * p >= x) return k * p
  return 10 * p
}

function makeClassOf(thresholds: number[]) {
  return (v: number) => {
    let i = 0
    while (i < thresholds.length && v >= thresholds[i]) i++
    return i
  }
}

/**
 * Seuils fixes par couche : une même couleur veut dire la même chose d'un scénario à l'autre et
 * d'une partie à l'autre (avant, l'échelle s'adaptait aux valeurs : ±1,5 %, ±15 %, ±30 %…).
 * Couches signées : 4 seuils symétriques (le cinquième intervalle, autour de zéro, est « stable »).
 */
const FIXED: Partial<Record<LayerId, number[]>> = {
  delta: [0.005, 0.02, 0.05, 0.1],
  growth: [0.02, 0.1, 0.2, 0.4],
  migration: [1, 3, 6, 10],
  medianAge: [40, 44, 47, 50, 53, 56, 59, 62],
  seniors: [35, 45, 55, 65, 75, 85, 95, 110],
  density: [20, 35, 50, 80, 120, 200, 500, 2000],
}

/** Échelle en 9 classes, fixe (sur toute la période et d'un scénario à l'autre). */
export function buildScale(def: LayerDef, values: Float64Array, palette: { diverging: string[]; sequential: string[] }): ClassScale {
  const finite = Array.from(values).filter(Number.isFinite)
  const fixed = FIXED[def.id]
  if (def.kind === 'signed') {
    const [a, b, c, d] = fixed ?? [0.005, 0.02, 0.05, 0.1]
    const t = [-d, -c, -b, -a, a, b, c, d]
    const f = def.format
    const labels = [
      `moins de ${f(-d)}`,
      `${f(-d)} à ${f(-c)}`,
      `${f(-c)} à ${f(-b)}`,
      `${f(-b)} à ${f(-a)}`,
      'stable',
      `${f(a)} à ${f(b)}`,
      `${f(b)} à ${f(c)}`,
      `${f(c)} à ${f(d)}`,
      `plus de ${f(d)}`,
    ]
    return { thresholds: t, colors: palette.diverging, classOf: makeClassOf(t), labels }
  }
  if (fixed) {
    const f = def.format
    const labels = Array.from({ length: fixed.length + 1 }, (_, i) =>
      i === 0 ? `moins de ${f(fixed[0])}` : i === fixed.length ? `${f(fixed[fixed.length - 1])} et plus` : `${f(fixed[i - 1])} à ${f(fixed[i])}`,
    )
    return { thresholds: fixed, colors: palette.sequential, classOf: makeClassOf(fixed), labels }
  }
  const sorted = finite.sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const raw = Array.from({ length: 8 }, (_, i) => q((i + 1) / 9))
  // arrondi lisible et seuils strictement croissants
  const t: number[] = []
  for (const x of raw) {
    const step = niceStep(Math.abs(x) / 20)
    const r = Math.round(x / step) * step
    if (!t.length || r > t[t.length - 1]) t.push(r)
  }
  const f = def.format
  const labels = Array.from({ length: t.length + 1 }, (_, i) =>
    i === 0 ? `moins de ${f(t[0])}` : i === t.length ? `${f(t[t.length - 1])} et plus` : `${f(t[i - 1])} à ${f(t[i])}`,
  )
  const colors = t.length + 1 === 9 ? palette.sequential : palette.sequential.slice(0, t.length + 1)
  return { thresholds: t, colors, classOf: makeClassOf(t), labels }
}
