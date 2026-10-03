import { describe, expect, it } from 'vitest'
import { areaDeps } from '../../src/engine/aggregate'
import { computeIndicators, totalPop } from '../../src/engine/indicators'
import { simulate } from '../../src/engine/simulate'
import type { ScenarioEvent } from '../../src/engine/types'
import { catalogFor } from '../../src/events/catalog'
import { EVENT_ICONS } from '../../src/events/icons'
import { EVENT_LIBRARY, LIBRARY_VISIBLE } from '../../src/events/library'
import { emptyScenario, loadAll } from './load'

const catalog = catalogFor({ custom: [] })
const place = (type: string, over: Partial<ScenarioEvent> = {}): ScenarioEvent => {
  const def = catalog.get(type)!
  return { uid: `t-${type}`, type, start: 2030, duration: def.defaults.duration, intensity: def.defaults.intensity, zone: def.defaults.zone, ...over }
}

describe('bibliothèque d’événements', () => {
  it('compte au moins 20 événements proposés, complets et cohérents', () => {
    expect(LIBRARY_VISIBLE.length).toBeGreaterThanOrEqual(20)
    const ids = new Set<string>()
    for (const e of EVENT_LIBRARY) {
      expect(ids.has(e.id), `id en double : ${e.id}`).toBe(false)
      ids.add(e.id)
      expect(EVENT_ICONS[e.icon], `icône manquante : ${e.icon}`).toBeTruthy()
      expect(e.summary.length).toBeGreaterThan(10)
      expect(e.hypothesis.length).toBeGreaterThan(10)
      expect(e.source.length).toBeGreaterThan(5)
      expect(e.effects.length).toBeGreaterThan(0)
    }
    for (const e of EVENT_LIBRARY) for (const c of e.cascades ?? []) expect(ids.has(c.spawn), `${e.id} → ${c.spawn}`).toBe(true)
    const families = new Set(LIBRARY_VISIBLE.map((e) => e.family))
    for (const f of ['sante', 'climat', 'economie', 'politique', 'societe', 'imprevu']) expect(families.has(f as never)).toBe(true)
  })

  it('chaque événement, posé seul, produit une population finie et positive', () => {
    const { data } = loadAll()
    for (const e of EVENT_LIBRARY) {
      const res = simulate(data, emptyScenario({ events: [place(e.id, { intensity: 1 })] }), catalog)
      for (let i = 0; i < res.pop.length; i += 997) expect(Number.isFinite(res.pop[i]) && res.pop[i] >= 0).toBe(true)
      expect(res.clipped, e.id).toBeLessThan(50)
    }
  })
})

describe('sens des effets', () => {
  const { data } = loadAll()
  const ref = simulate(data, emptyScenario(), catalog)
  const fr = areaDeps(data, { level: 'france' })
  const run = (type: string, over: Partial<ScenarioEvent> = {}) => simulate(data, emptyScenario({ events: [place(type, over)] }), catalog)
  const pop = (r: ReturnType<typeof run>, deps: number[], y: number) => totalPop(r, deps, y - data.startYear)

  it('une politique nataliste ajoute des naissances', () => {
    const r = run('politique-nataliste')
    const yi = 2045 - data.startYear
    expect(computeIndicators(data, r, fr, yi).births).toBeGreaterThan(computeIndicators(data, ref, fr, yi).births * 1.03)
  })

  it('le télétravail fait grandir la Bretagne et rétrécir l’Île-de-France', () => {
    const r = run('teletravail')
    const bzh = areaDeps(data, { level: 'region', code: '53' })
    const idf = areaDeps(data, { level: 'region', code: '11' })
    expect(pop(r, bzh, 2050)).toBeGreaterThan(pop(ref, bzh, 2050))
    expect(pop(r, idf, 2050)).toBeLessThan(pop(ref, idf, 2050))
    // les déménagements ne changent pas la population totale
    expect(Math.abs(pop(r, fr, 2050) / pop(ref, fr, 2050) - 1)).toBeLessThan(0.002)
  })

  it('la fermeture des frontières réduit la population, l’ouverture l’augmente', () => {
    expect(pop(run('fermeture-migratoire'), fr, 2050)).toBeLessThan(pop(ref, fr, 2050))
    expect(pop(run('ouverture-migratoire'), fr, 2050)).toBeGreaterThan(pop(ref, fr, 2050))
  })

  it('la réforme des retraites ne change pas la population mais allège la pression sur les retraites', () => {
    const r = run('reforme-retraites')
    const yi = 2050 - data.startYear
    expect(pop(r, fr, 2050)).toBeCloseTo(pop(ref, fr, 2050), 0)
    expect(computeIndicators(data, r, fr, yi).pensionPressure).toBeLessThan(computeIndicators(data, ref, fr, yi).pensionPressure - 3)
  })

  it('les canicules à répétition déclenchent une cascade visible jusqu’au Nord', () => {
    const r = run('canicules-repetees', { duration: 12, intensity: 0.8 })
    const chain = r.events.map((e) => e.type)
    expect(chain).toEqual(expect.arrayContaining(['canicules-repetees', 'crise-agricole', 'migration-climatique', 'pression-logement']))
    const agri = r.events.find((e) => e.type === 'crise-agricole')!
    const mig = r.events.find((e) => e.type === 'migration-climatique')!
    expect(agri.causedBy).toBe('t-canicules-repetees')
    expect(mig.causedBy).toBe(agri.uid)
    const nord = areaDeps(data, { level: 'region', code: '32' })
    expect(pop(r, nord, 2060)).toBeGreaterThan(pop(ref, nord, 2060))
  })
})
