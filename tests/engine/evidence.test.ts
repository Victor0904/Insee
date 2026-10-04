import { describe, expect, it } from 'vitest'
import { computeIndicators, totalPop } from '../../src/engine/indicators'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { EVENT_LIBRARY, INSEE_VARIANTS } from '../../src/events/library'
import { emptyScenario, loadAll } from './load'

const cat = catalogFor({ custom: [] })
const FR = { level: 'france' as const, codes: [] }

describe('niveau de preuve des événements', () => {
  const { data, reference } = loadAll()
  const all = data.departments.map((_, i) => i)
  const base = simulate(data, emptyScenario(), cat)
  const variants = reference.variants!
  const central = reference.national

  it('chaque événement déclare un niveau de preuve cohérent', () => {
    for (const e of EVENT_LIBRARY) {
      const ev = e.evidence ?? 'hypothese'
      expect(['insee', 'historique', 'hypothese']).toContain(ev)
      if (ev === 'insee') expect(variants.total[e.inseeVariant!], e.id).toBeTruthy()
    }
    expect(INSEE_VARIANTS).toHaveLength(7)
  })

  for (const def of INSEE_VARIANTS) {
    it(`« ${def.name} » reproduit la variante officielle (écart au scénario central accumulé depuis 2025)`, () => {
      const y0 = data.startYear
      const res = simulate(data, emptyScenario({ events: [{ uid: 'v', type: def.id, start: def.officialStart!, duration: def.defaults.duration, intensity: 1, zone: FR }] }), cat)
      // les variantes migratoires de l'Insee divergent dès 2023 : on compare l'écart accumulé
      // depuis 2025, année de départ du moteur (population observée)
      const inseeDelta = (y: number) => variants.total[def.inseeVariant!][variants.years.indexOf(y)] - central.total[central.years.indexOf(y)]
      const rows: string[] = []
      for (const y of [2030, 2050, 2070]) {
        const yi = y - data.startYear
        const engine = totalPop(res, all, yi) - totalPop(base, all, yi)
        const insee = inseeDelta(y) - inseeDelta(y0)
        rows.push(`${y} : moteur ${(engine / 1e6).toFixed(2)} M, Insee ${(insee / 1e6).toFixed(2)} M`)
        // tolérance : 10 % de l'écart officiel (ou 60 000 habitants pour les petits écarts du début)
        expect(Math.abs(engine - insee), `${def.id} ${y}`).toBeLessThan(Math.max(60_000, 0.1 * Math.abs(insee)))
      }
      console.info(`[variante] ${def.name} — ${rows.join(' · ')}`)
    })
  }

  it('la pandémie à intensité forte a l’ampleur de 2020 (+9 % de décès)', () => {
    const res = simulate(data, emptyScenario({ events: [{ uid: 'p', type: 'pandemie', start: 2030, duration: 2, intensity: 1, zone: FR }] }), cat)
    const yi = 2031 - data.startYear
    const rise = computeIndicators(data, res, all, yi).deaths / computeIndicators(data, base, all, yi).deaths - 1
    console.info(`[histoire] pandémie : +${(100 * rise).toFixed(1)} % de décès (2020 : +9 %)`)
    expect(rise).toBeGreaterThan(0.075)
    expect(rise).toBeLessThan(0.105)
  })

  it('la canicule à intensité forte a l’ampleur de 2003 (+2,7 % de décès sur l’année)', () => {
    const res = simulate(data, emptyScenario({ events: [{ uid: 'c', type: 'canicule', start: 2030, duration: 1, intensity: 1, zone: FR }] }), cat)
    const yi = 2031 - data.startYear
    const rise = computeIndicators(data, res, all, yi).deaths / computeIndicators(data, base, all, yi).deaths - 1
    console.info(`[histoire] canicule : +${(100 * rise).toFixed(1)} % de décès (2003 : +2,7 %)`)
    expect(rise).toBeGreaterThan(0.022)
    expect(rise).toBeLessThan(0.032)
  })
})
