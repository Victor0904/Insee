import { compSum, totalPop } from './indicators'
import { AGES, COMP_BIRTHS, COMP_DEATHS, COMP_EXT, COMP_IN, COMP_OUT, SEXES, type SimResult } from './types'

export type ComponentKey = 'births' | 'deaths' | 'in' | 'out' | 'ext'

export interface ComponentPart {
  key: ComponentKey
  label: string
  /** Contribution signée à l'écart de population (habitants). */
  value: number
}

export interface Decomposition {
  year: number
  scenario: number
  reference: number
  delta: number
  parts: ComponentPart[]
  /** Écart non expliqué par les composantes (arrondis, troncature) : doit rester négligeable. */
  residual: number
}

const LABELS: Record<ComponentKey, string> = {
  births: 'Naissances',
  deaths: 'Décès',
  in: 'Arrivées d’autres départements',
  out: 'Départs vers d’autres départements',
  ext: 'Solde avec l’étranger',
}

/**
 * Décompose l'écart de population d'une zone entre le scénario et la référence au 1er janvier
 * de l'année yi, en cumulant depuis 2025 l'écart de chaque composante :
 *   Δpop = Δnaissances − Δdécès + Δarrivées − Δdéparts + Δétranger
 */
export function decompose(base: SimResult, res: SimResult, deps: number[], yi: number): Decomposition {
  const sum = (r: SimResult, c: number) => {
    let t = 0
    for (let y = 0; y < yi; y++) t += compSum(r, deps, y, c)
    return t
  }
  const d = (c: number) => sum(res, c) - sum(base, c)
  const parts: ComponentPart[] = [
    { key: 'births', label: LABELS.births, value: d(COMP_BIRTHS) },
    { key: 'deaths', label: LABELS.deaths, value: -d(COMP_DEATHS) },
    { key: 'in', label: LABELS.in, value: d(COMP_IN) },
    { key: 'out', label: LABELS.out, value: -d(COMP_OUT) },
    { key: 'ext', label: LABELS.ext, value: d(COMP_EXT) },
  ]
  const scenario = totalPop(res, deps, yi)
  const reference = totalPop(base, deps, yi)
  const delta = scenario - reference
  const explained = parts.reduce((s, p) => s + p.value, 0)
  return { year: res.startYear + yi, scenario, reference, delta, parts, residual: delta - explained }
}

/** Totaux par département et par année (y * n + d), pour comparer des simulations sans tout transférer. */
export function depTotals(r: SimResult): Float32Array {
  const n = r.nDep
  const out = new Float32Array(r.nYears * n)
  const cell = SEXES * AGES
  for (let y = 0; y < r.nYears; y++)
    for (let d = 0; d < n; d++) {
      let t = 0
      const base = (y * n + d) * cell
      for (let i = 0; i < cell; i++) t += r.pop[base + i]
      out[y * n + d] = t
    }
  return out
}

export interface EventContribution {
  uid: string
  value: number
}

/**
 * Part de chaque événement dans l'écart : population du scénario complet moins population du
 * scénario privé de cet événement (et de ses conséquences en cascade). Le reste est attribué
 * aux « effets croisés » entre événements.
 */
export function eventContributions(
  full: Float32Array,
  without: { uid: string; totals: Float32Array }[],
  n: number,
  deps: number[],
  yi: number,
): EventContribution[] {
  const at = (t: Float32Array) => deps.reduce((s, d) => s + t[yi * n + d], 0)
  const f = at(full)
  return without.map((w) => ({ uid: w.uid, value: f - at(w.totals) }))
}
