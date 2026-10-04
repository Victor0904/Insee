import { areaDeps, areaName, type AreaRef } from '../engine/aggregate'
import { compSum, computeIndicators, totalPop } from '../engine/indicators'
import { zoneDeps } from '../engine/zones'
import {
  AGES,
  COMP_BIRTHS,
  COMP_DEATHS,
  COMP_EXT,
  COMP_IN,
  COMP_OUT,
  SEXES,
  type EventDef,
  type ModelData,
  type ScenarioEvent,
  type SimResult,
} from '../engine/types'
import { fmtDec1, fmtInt, fmtSigned } from '../lib/format'

export interface StoryLine {
  text: string
  tone: 'gain' | 'loss' | 'neutral'
}

const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: 'des enfants', lo: 0, hi: 14 },
  { label: 'des 15-29 ans', lo: 15, hi: 29 },
  { label: 'des 30-44 ans', lo: 30, hi: 44 },
  { label: 'des 45-64 ans', lo: 45, hi: 64 },
  { label: 'des 65 ans et plus', lo: 65, hi: 100 },
]

const PLURAL_START = ['Hauts', 'Hautes', 'Pays', 'Bouches', 'Alpes', 'Pyrénées', 'Landes', 'Ardennes', 'Vosges', 'Yvelines', 'Deux', 'Côtes']

/** « de Bretagne », « d’Île-de-France », « des Hauts-de-France ». */
export function deName(name: string): string {
  if (PLURAL_START.some((p) => name.startsWith(p))) return `des ${name}`
  return /^[AEIOUYÉÈÊÎÏÔaeiouyéèêîïô]/.test(name) ? `d’${name}` : `de ${name}`
}

/** « vers la Bretagne », « vers l’Île-de-France », « vers les Hauts-de-France » (régions). */
export function toName(name: string): string {
  if (PLURAL_START.some((p) => name.startsWith(p))) return `les ${name}`
  if (/^[AEIOUYÉÈÊÎÏÔ]/.test(name)) return `l’${name}`
  if (['Corse', 'Bretagne', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Bourgogne-Franche-Comté'].includes(name)) return `la ${name}`
  if (name.startsWith('Grand Est') || name.startsWith('Centre')) return `le ${name}`
  return name
}

const pct = (x: number) => `${fmtSigned(100 * x, fmtDec1)} %`

function bandDelta(base: SimResult, res: SimResult, deps: number[], yi: number) {
  const block = res.nDep * SEXES * AGES
  return BANDS.map((b) => {
    let d = 0
    for (const dep of deps)
      for (let s = 0; s < SEXES; s++)
        for (let a = b.lo; a <= b.hi; a++) {
          const i = yi * block + (dep * SEXES + s) * AGES + a
          d += res.pop[i] - base.pop[i]
        }
    return { ...b, d }
  })
}

const cumul = (r: SimResult, deps: number[], yi: number, c: number) => {
  let t = 0
  for (let y = 0; y < yi; y++) t += compSum(r, deps, y, c)
  return t
}

/** Unités géographiques à comparer et origine/destination des flux, à la maille adaptée. */
function units(data: ModelData, area: AreaRef): { name: string; deps: number[] }[] {
  if (area.level === 'france')
    return data.regions.map((r) => ({ name: r.name, deps: areaDeps(data, { level: 'region', code: r.code }) }))
  if (area.level === 'region') return areaDeps(data, area).map((d) => ({ name: data.departments[d].name, deps: [d] }))
  return [{ name: areaName(data, area), deps: areaDeps(data, area) }]
}

/** Plus grande zone d'origine (ou de destination) des déménagements supplémentaires. */
function mainPartner(data: ModelData, base: SimResult, res: SimResult, deps: number[], yi: number, dir: 'in' | 'out') {
  if (!res.flows || !base.flows) return null
  const n = data.nDep
  const inside = new Set(deps)
  const byReg = new Map<string, number>()
  for (let y = 0; y < yi; y++)
    for (const d of deps)
      for (let o = 0; o < n; o++) {
        if (inside.has(o)) continue
        const idx = dir === 'in' ? (y * n + o) * n + d : (y * n + d) * n + o
        const v = res.flows[idx] - base.flows[idx]
        const r = data.departments[o].reg
        byReg.set(r, (byReg.get(r) ?? 0) + v)
      }
  // région partenaire principale
  let bestReg = ''
  let bestRegV = 0
  for (const [r, v] of byReg)
    if (v > bestRegV) {
      bestRegV = v
      bestReg = r
    }
  if (bestRegV <= 0) return null
  return data.regions.find((r) => r.code === bestReg)!.name
}

/** Événement le plus probablement en cause pour une zone et une composante. */
function blame(
  data: ModelData,
  events: ScenarioEvent[],
  catalog: ReadonlyMap<string, EventDef>,
  deps: number[],
  year: number,
  kinds: string[],
): ScenarioEvent | null {
  const set = new Set(deps)
  let best: ScenarioEvent | null = null
  let bestScore = 0
  for (const ev of events) {
    if (ev.start > year) continue
    const def = catalog.get(ev.type)
    if (!def) continue
    const z = zoneDeps(data, ev.zone)
    let score = 0
    for (const eff of def.effects) {
      if (!kinds.includes(eff.kind)) continue
      const overlap = z.filter((d) => set.has(d)).length / Math.max(1, deps.length)
      const target = eff.kind === 'move' ? zoneDeps(data, eff.to).filter((d) => set.has(d)).length / Math.max(1, deps.length) : 0
      // un déménagement ou un événement national concerne aussi les autres zones (effet indirect)
      score = Math.max(score, overlap, target, ev.zone.level === 'france' ? 0.5 : 0, eff.kind === 'move' || eff.kind === 'attract' ? 0.2 : 0)
    }
    score *= ev.intensity
    if (score > bestScore) {
      bestScore = score
      best = ev
    }
  }
  return best
}

function eventPhrase(ev: ScenarioEvent, all: ScenarioEvent[], catalog: ReadonlyMap<string, EventDef>): string {
  const name = catalog.get(ev.type)?.name ?? ev.type
  const parent = ev.causedBy ? all.find((e) => e.uid === ev.causedBy) : undefined
  const pName = parent ? catalog.get(parent.type)?.name : undefined
  return pName ? `après « ${name} » (conséquence de « ${pName} »)` : `après « ${name} » (${ev.start})`
}

/**
 * Récit automatique : les 3 changements les plus marquants de la zone par rapport à la référence,
 * avec la tranche d'âge concernée, la composante en cause et l'événement le plus probable.
 * Phrases construites à partir des résultats, sans données inventées.
 */
export function narrate(
  data: ModelData,
  base: SimResult,
  res: SimResult,
  catalog: ReadonlyMap<string, EventDef>,
  area: AreaRef,
  yi: number,
): StoryLine[] {
  if (!res.events.length || yi === 0 || res === base) return []
  const year = data.startYear + yi
  const lines: StoryLine[] = []
  const zoneDepsAll = areaDeps(data, area)

  // 1. indicateurs d'ensemble de la zone choisie
  const ia = computeIndicators(data, res, zoneDepsAll, yi)
  const ib = computeIndicators(data, base, zoneDepsAll, yi)
  const dWork = ia.seniorsPer100Workers - ib.seniorsPer100Workers
  const dPension = ia.pensionPressure - ib.pensionPressure
  if (Math.abs(dPension - dWork) > 1 && Math.abs(dPension) > 1) {
    const ev = blame(data, res.events, catalog, zoneDepsAll, year, ['retirementAge'])
    lines.push({
      text: `${areaName(data, area)} : ${fmtInt(ia.pensionPressure)} personnes en âge de retraite pour 100 cotisants en ${year}, contre ${fmtInt(ib.pensionPressure)} dans la référence${ev ? `, ${eventPhrase(ev, res.events, catalog)}` : ''}.`,
      tone: dPension < 0 ? 'gain' : 'loss',
    })
  } else if (Math.abs(dWork) >= 1) {
    lines.push({
      text: `${areaName(data, area)} : ${fmtInt(ia.seniorsPer100Workers)} seniors pour 100 actifs en ${year}, contre ${fmtInt(ib.seniorsPer100Workers)} dans la référence.`,
      tone: dWork < 0 ? 'gain' : 'loss',
    })
  }

  // 2. zones qui changent le plus
  const ranked = units(data, area)
    .map((u) => {
      const pb = totalPop(base, u.deps, yi)
      const ps = totalPop(res, u.deps, yi)
      return { ...u, rel: ps / pb - 1, delta: ps - pb }
    })
    .filter((u) => Math.abs(u.rel) >= 0.002)
    .sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))

  for (const u of ranked) {
    if (lines.length >= 3) break
    const gain = u.delta > 0
    const bands = bandDelta(base, res, u.deps, yi).filter((b) => Math.sign(b.d) === Math.sign(u.delta))
    const band = bands.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]
    const comps = [
      { k: 'births', v: cumul(res, u.deps, yi, COMP_BIRTHS) - cumul(base, u.deps, yi, COMP_BIRTHS) },
      { k: 'deaths', v: -(cumul(res, u.deps, yi, COMP_DEATHS) - cumul(base, u.deps, yi, COMP_DEATHS)) },
      { k: 'in', v: cumul(res, u.deps, yi, COMP_IN) - cumul(base, u.deps, yi, COMP_IN) },
      { k: 'out', v: -(cumul(res, u.deps, yi, COMP_OUT) - cumul(base, u.deps, yi, COMP_OUT)) },
      { k: 'ext', v: cumul(res, u.deps, yi, COMP_EXT) - cumul(base, u.deps, yi, COMP_EXT) },
    ].filter((c) => Math.sign(c.v) === Math.sign(u.delta))
    const main = comps.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0]

    let why = ''
    let kinds: string[] = []
    if (main) {
      if (main.k === 'in' || main.k === 'out') {
        if (gain && main.k === 'in') {
          const p = mainPartner(data, base, res, u.deps, yi, 'in')
          why = p ? `venus surtout ${deName(p)}` : 'arrivés d’autres départements'
        } else if (!gain && main.k === 'out') {
          const p = mainPartner(data, base, res, u.deps, yi, 'out')
          why = p ? `partis surtout vers ${toName(p)}` : 'partis vers d’autres départements'
        } else why = gain ? 'avec moins de départs vers le reste de la France' : 'avec moins d’arrivées du reste de la France'
        kinds = ['move', 'leave', 'attract']
      } else if (main.k === 'births') {
        why = gain ? 'grâce à des naissances plus nombreuses' : 'faute de naissances'
        kinds = ['fertility']
      } else if (main.k === 'deaths') {
        why = gain ? 'grâce à une mortalité plus faible' : 'à cause d’une mortalité plus forte'
        kinds = ['mortality']
      } else {
        why = gain ? 'avec davantage d’arrivées de l’étranger' : 'avec moins d’arrivées de l’étranger'
        kinds = ['external', 'externalMult']
      }
    }
    const ev = kinds.length ? blame(data, res.events, catalog, u.deps, year, kinds) : null
    const who = band ? `, surtout ${band.label}` : ''
    lines.push({
      text: `${u.name} : ${pct(u.rel)} d’habitants (${fmtSigned(u.delta)}) par rapport à la référence en ${year}${who}${why ? `, ${why}` : ''}${ev ? `, ${eventPhrase(ev, res.events, catalog)}` : ''}.`,
      tone: gain ? 'gain' : 'loss',
    })
  }

  if (!lines.length)
    lines.push({ text: `En ${year}, ${areaName(data, area)} reste très proche de la référence (écarts inférieurs à 0,2 %).`, tone: 'neutral' })
  return lines.slice(0, 3)
}
