import { AGES, SEXES, type AgeRange, type EventDef, type ModelData, type Scenario, type ScenarioEvent } from './types'
import { zoneDeps } from './zones'

export type EventCatalog = ReadonlyMap<string, EventDef>

/** Ajoute aux événements du joueur ceux que déclenchent les cascades (profondeur max. 3). */
export function expandCascades(scenario: Scenario, catalog: EventCatalog, endYear: number): ScenarioEvent[] {
  const out: ScenarioEvent[] = [...scenario.events]
  let frontier = scenario.events
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: ScenarioEvent[] = []
    for (const ev of frontier) {
      const def = catalog.get(ev.type)
      for (const rule of def?.cascades ?? []) {
        if (ev.intensity < rule.minIntensity || ev.duration < rule.afterYears) continue
        const child = catalog.get(rule.spawn)
        if (!child) continue
        const start = ev.start + rule.afterYears + rule.delay
        if (start > endYear) continue
        const spawned: ScenarioEvent = {
          uid: `${ev.uid}>${rule.spawn}`,
          type: rule.spawn,
          start,
          duration: rule.duration ?? child.defaults.duration,
          intensity: Math.min(2, ev.intensity * rule.intensityFactor),
          zone: rule.zone === 'same' ? ev.zone : rule.zone,
          causedBy: ev.uid,
        }
        next.push(spawned)
      }
    }
    out.push(...next)
    frontier = next
  }
  return out
}

/** Niveau d'activité (0..1) d'un événement pour l'année y, avant intensité. */
export function activity(def: EventDef, ev: ScenarioEvent, y: number): number {
  const { start } = ev
  const dur = Math.max(1, ev.duration)
  const end = start + dur
  if (y < start) return 0
  switch (def.profile) {
    case 'pulse':
      return y === start ? 1 : def.persistent && y > start ? 1 : 0
    case 'step':
      return y < end || def.persistent ? 1 : 0
    case 'ramp':
      if (y >= end) return def.persistent ? 1 : 0
      return (y - start + 1) / dur
    case 'peak': {
      if (y >= end) return def.persistent ? 1 : 0
      const mid = (dur - 1) / 2
      return mid <= 0 ? 1 : 1 - Math.abs(y - start - mid) / (mid + 1)
    }
  }
}

/** Modificateurs de paramètres pour une année donnée. */
export interface YearModifiers {
  mortMult: Float64Array // (d*2+s)*101 + âge au 1er janvier
  fertMult: Float64Array // d*101 + âge de la mère au 1er janvier
  leave: Float64Array // d*101 + âge : départs supplémentaires (taux)
  attract: Float64Array // bg*n + d
  anyAttract: boolean
  moves: { from: number[]; to: number[]; rate: Float64Array }[]
  extAdd: { deps: number[]; rate: number; ages: AgeRange }[]
  extMult: number
  retirementAge: number
}

export function createModifiers(data: ModelData): YearModifiers {
  const n = data.nDep
  return {
    mortMult: new Float64Array(n * SEXES * AGES),
    fertMult: new Float64Array(n * AGES),
    leave: new Float64Array(n * AGES),
    attract: new Float64Array(data.nBroad * n),
    anyAttract: false,
    moves: [],
    extAdd: [],
    extMult: 1,
    retirementAge: BASE_RETIREMENT_AGE,
  }
}

export interface CompiledEvent {
  ev: ScenarioEvent
  def: EventDef
  deps: number[]
}

export function prepareEvents(data: ModelData, events: ScenarioEvent[], catalog: EventCatalog): CompiledEvent[] {
  const out: CompiledEvent[] = []
  for (const ev of events) {
    const def = catalog.get(ev.type)
    if (!def) continue
    out.push({ ev, def, deps: zoneDeps(data, ev.zone) })
  }
  return out
}

const ALL_AGES: AgeRange = [0, AGES - 1]
export const BASE_RETIREMENT_AGE = 64

/** Remplit `m` pour l'année y. Retourne vrai si au moins un événement est actif. */
export function fillModifiers(data: ModelData, m: YearModifiers, events: CompiledEvent[], y: number): boolean {
  m.mortMult.fill(1)
  m.fertMult.fill(1)
  m.leave.fill(0)
  m.attract.fill(1)
  m.anyAttract = false
  m.moves = []
  m.extAdd = []
  m.extMult = 1
  m.retirementAge = BASE_RETIREMENT_AGE
  let active = false
  const n = data.nDep

  for (const { ev, def, deps } of events) {
    const act = activity(def, ev, y)
    if (act <= 0) continue
    const e = act * ev.intensity
    if (e <= 0) continue
    active = true
    for (const eff of def.effects) {
      const [lo, hi] = 'ages' in eff && eff.ages ? eff.ages : ALL_AGES
      switch (eff.kind) {
        case 'mortality': {
          const mult = Math.max(0, 1 + (eff.mult - 1) * e)
          for (const d of deps)
            for (let s = 0; s < SEXES; s++) {
              if (eff.sex !== undefined && eff.sex !== s) continue
              const base = (d * SEXES + s) * AGES
              for (let a = lo; a <= hi; a++) m.mortMult[base + a] *= mult
            }
          break
        }
        case 'fertility': {
          const yi = Math.max(0, Math.min(data.nYears - 1, y - data.startYear))
          const target = eff.targetIcf && data.icfRef[yi] > 0 ? eff.targetIcf / data.icfRef[yi] : eff.mult
          const mult = Math.max(0, 1 + (target - 1) * e)
          for (const d of deps) for (let a = lo; a <= hi; a++) m.fertMult[d * AGES + a] *= mult
          break
        }
        case 'leave':
          for (const d of deps) for (let a = lo; a <= hi; a++) m.leave[d * AGES + a] += eff.rate * e
          break
        case 'attract': {
          const mult = Math.max(0, 1 + (eff.mult - 1) * e)
          m.anyAttract = true
          for (let bg = 0; bg < data.nBroad; bg++) {
            // appliqué aux classes larges qui recouvrent la tranche d'âge demandée
            const covers = data.ageToBroad.some((b, a) => b === bg && a >= lo && a <= hi)
            if (!covers) continue
            for (const d of deps) m.attract[bg * n + d] *= mult
          }
          break
        }
        case 'move': {
          const rate = new Float64Array(AGES)
          for (let a = lo; a <= hi; a++) rate[a] = eff.rate * e
          m.moves.push({ from: deps, to: zoneDeps(data, eff.to), rate })
          break
        }
        case 'external':
          m.extAdd.push({ deps, rate: eff.rate * e, ages: [lo, hi] })
          break
        case 'externalMult':
          m.extMult *= Math.max(0, 1 + (eff.mult - 1) * e)
          break
        case 'retirementAge':
          m.retirementAge = Math.max(m.retirementAge, BASE_RETIREMENT_AGE + (eff.age - BASE_RETIREMENT_AGE) * Math.min(1, e))
          break
      }
    }
  }
  return active
}
