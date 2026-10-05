import { describe, expect, it } from 'vitest'
import { areaDeps } from '../../src/engine/aggregate'
import { computeIndicators, totalPop } from '../../src/engine/indicators'
import { simulate } from '../../src/engine/simulate'
import { AGES, COMP_IN, COMP_OUT, N_COMP, SEXES, type EventDef, type ModelData } from '../../src/engine/types'
import { emptyScenario, loadAll, noCatalog } from './load'
import { catalogFor } from '../../src/events/catalog'
import { decompose } from '../../src/engine/decompose'
import { EVENT_LIBRARY } from '../../src/events/library'
import { LITTORAL, SUD } from '../../src/events/zones'

const sumPop = (pop: Float32Array, yi: number, block: number) => {
  let t = 0
  for (let i = yi * block; i < (yi + 1) * block; i++) t += pop[i]
  return t
}

describe('conservation', () => {
  it('sans naissance, décès ni migration, la population est conservée et vieillit d’un an par an', () => {
    const { data } = loadAll()
    const frozen: ModelData = {
      ...data,
      q: new Float64Array(data.q.length),
      fert: new Float64Array(data.fert.length),
      migRate: new Float64Array(data.migRate.length),
      extLevel: new Float64Array(data.extLevel.length),
    }
    const res = simulate(frozen, emptyScenario(), noCatalog)
    const block = data.nDep * SEXES * AGES
    const p0 = sumPop(res.pop, 0, block)
    for (let yi = 1; yi < res.nYears; yi++) expect(Math.abs(sumPop(res.pop, yi, block) - p0) / p0).toBeLessThan(1e-6)
    // une cohorte précise : les femmes de 30 ans de l'Ain en 2025 ont 40 ans en 2035
    const d = 0
    const at = (yi: number, a: number) => res.pop[yi * block + (d * SEXES + 1) * AGES + a]
    expect(at(10, 40)).toBeCloseTo(at(0, 30), 2)
    expect(res.clipped).toBe(0)
  })

  it('les migrations internes ne créent ni ne détruisent personne', () => {
    const { data } = loadAll()
    const res = simulate(data, emptyScenario(), noCatalog)
    for (const yi of [0, 20, 60]) {
      let inn = 0
      let out = 0
      for (let d = 0; d < data.nDep; d++) {
        inn += res.comps[(yi * data.nDep + d) * N_COMP + COMP_IN]
        out += res.comps[(yi * data.nDep + d) * N_COMP + COMP_OUT]
      }
      // composantes stockées en Float32 : précision relative ~1e-7 par valeur
      expect(Math.abs(inn - out) / out).toBeLessThan(1e-5)
    }
  })

  it('bilan comptable : P(n+1) = P(n) + naissances − décès + solde migratoire', () => {
    const { data } = loadAll()
    const res = simulate(data, emptyScenario(), noCatalog)
    const fr = areaDeps(data, { level: 'france' })
    for (const yi of [0, 30, 70]) {
      const ind = computeIndicators(data, res, fr, yi + 1) // composantes de yi → yi+1
      const p0 = totalPop(res, fr, yi)
      const p1 = totalPop(res, fr, yi + 1)
      expect(Math.abs(p0 + ind.naturalBalance + ind.migrationBalance - p1) / p1).toBeLessThan(1e-5)
    }
  })
})

describe('agrégations', () => {
  it('la somme des régions et celle des départements égalent la France', () => {
    const { data } = loadAll()
    const res = simulate(data, emptyScenario(), noCatalog)
    for (const yi of [0, 25, 75]) {
      const fr = totalPop(res, areaDeps(data, { level: 'france' }), yi)
      const regs = data.regions.reduce((s, r) => s + totalPop(res, areaDeps(data, { level: 'region', code: r.code }), yi), 0)
      const deps = data.departments.reduce((s, d) => s + totalPop(res, areaDeps(data, { level: 'dep', code: d.code }), yi), 0)
      expect(Math.abs(regs - fr) / fr).toBeLessThan(1e-9)
      expect(Math.abs(deps - fr) / fr).toBeLessThan(1e-9)
    }
    expect(data.regions).toHaveLength(18) // 13 régions de métropole + 5 d'outre-mer
    expect(data.nDep).toBe(101)
  })

  it('les indicateurs régionaux sont cohérents avec leurs départements', () => {
    const { data } = loadAll()
    const res = simulate(data, emptyScenario(), noCatalog)
    const reg = areaDeps(data, { level: 'region', code: '53' }) // Bretagne
    const yi = 40
    const r = computeIndicators(data, res, reg, yi)
    const parts = reg.map((d) => computeIndicators(data, res, [d], yi))
    expect(parts.reduce((s, p) => s + p.births, 0)).toBeCloseTo(r.births, 3)
    expect(parts.reduce((s, p) => s + p.workingAge, 0)).toBeCloseTo(r.workingAge, 3)
    expect(r.medianAge).toBeGreaterThan(Math.min(...parts.map((p) => p.medianAge)) - 1e-9)
    expect(r.medianAge).toBeLessThan(Math.max(...parts.map((p) => p.medianAge)) + 1e-9)
  })
})

describe('déterminisme', () => {
  it('même scénario et même graine → résultats identiques', () => {
    const { data } = loadAll()
    const a = simulate(data, emptyScenario({ seed: 42, randomness: 0.8 }), noCatalog)
    const b = simulate(data, emptyScenario({ seed: 42, randomness: 0.8 }), noCatalog)
    expect(Buffer.from(a.pop.buffer).equals(Buffer.from(b.pop.buffer))).toBe(true)
  })

  it('une autre graine donne une autre trajectoire, sans aléa la graine est ignorée', () => {
    const { data } = loadAll()
    const a = simulate(data, emptyScenario({ seed: 1, randomness: 0.8 }), noCatalog)
    const b = simulate(data, emptyScenario({ seed: 2, randomness: 0.8 }), noCatalog)
    expect(Buffer.from(a.pop.buffer).equals(Buffer.from(b.pop.buffer))).toBe(false)
    const c = simulate(data, emptyScenario({ seed: 1, randomness: 0 }), noCatalog)
    const d = simulate(data, emptyScenario({ seed: 99, randomness: 0 }), noCatalog)
    expect(Buffer.from(c.pop.buffer).equals(Buffer.from(d.pop.buffer))).toBe(true)
  })
})

describe('événements', () => {
  const pandemic: EventDef = {
    id: 'test-pandemie',
    name: 'Pandémie test',
    family: 'sante',
    icon: 'virus',
    summary: 'test',
    defaults: { duration: 2, intensity: 1, zone: { level: 'france', codes: [] } },
    profile: 'step',
    effects: [{ kind: 'mortality', mult: 1.5, ages: [65, 100] }],
    cascades: [
      { spawn: 'test-baby', afterYears: 2, minIntensity: 0.5, delay: 1, zone: 'same', intensityFactor: 1, because: 'rattrapage' },
    ],
    hypothesis: 'test',
    source: 'test',
    estimated: true,
  }
  const baby: EventDef = {
    ...pandemic,
    id: 'test-baby',
    effects: [{ kind: 'fertility', mult: 1.1 }],
    cascades: [],
  }
  const catalog = new Map([
    [pandemic.id, pandemic],
    [baby.id, baby],
  ])

  it('une surmortalité des seniors réduit la population et déclenche sa cascade', () => {
    const { data } = loadAll()
    const ref = simulate(data, emptyScenario(), noCatalog)
    const sc = emptyScenario({
      events: [{ uid: 'e1', type: pandemic.id, start: 2030, duration: 2, intensity: 1, zone: { level: 'france', codes: [] } }],
    })
    const res = simulate(data, sc, catalog)
    const fr = areaDeps(data, { level: 'france' })
    const yi = 2033 - data.startYear
    expect(totalPop(res, fr, yi)).toBeLessThan(totalPop(ref, fr, yi))
    expect(totalPop(res, fr, 2029 - data.startYear)).toBeCloseTo(totalPop(ref, fr, 2029 - data.startYear), 0)
    const child = res.events.find((e) => e.causedBy === 'e1')
    expect(child?.type).toBe('test-baby')
    expect(child?.start).toBe(2033)
  })

  it('une zone limitée ne modifie pas les autres départements l’année de l’événement', () => {
    const { data } = loadAll()
    const ref = simulate(data, emptyScenario(), noCatalog)
    const sc = emptyScenario({
      events: [{ uid: 'e1', type: pandemic.id, start: 2030, duration: 2, intensity: 1, zone: { level: 'dep', codes: ['23'] } }],
    })
    const res = simulate(data, sc, catalog)
    const creuse = areaDeps(data, { level: 'dep', code: '23' })
    const yi = 2031 - data.startYear
    expect(totalPop(res, creuse, yi)).toBeLessThan(totalPop(ref, creuse, yi))
    const deathsElsewhere = computeIndicators(data, res, areaDeps(data, { level: 'dep', code: '75' }), yi).deaths
    const deathsElsewhereRef = computeIndicators(data, ref, areaDeps(data, { level: 'dep', code: '75' }), yi).deaths
    expect(deathsElsewhere).toBeCloseTo(deathsElsewhereRef, 6)
  })
})

describe('retour de test du 4 octobre 2026', () => {
  const { data } = loadAll()
  const cat = catalogFor({ custom: [] })
  const base = simulate(data, emptyScenario(), cat)
  const FR_ALL = data.departments.map((_, i) => i)
  const dep = (code: string) => data.departments.findIndex((d) => d.code === code)

  it('les déménagements entre départements s’annulent exactement à l’échelle de la France', () => {
    // les parts de destination arrondies dans le JSON faisaient « perdre » quelques personnes par an
    const sc = emptyScenario({ events: [{ uid: 'm', type: 'montee-eaux', start: 2030, duration: 30, intensity: 1, zone: LITTORAL }] })
    for (const res of [base, simulate(data, sc, cat)]) {
      const d = decompose(base, res, FR_ALL, 2070 - data.startYear)
      const net = d.parts.find((p) => p.key === 'in')!.value + d.parts.find((p) => p.key === 'out')!.value
      expect(Math.abs(net)).toBeLessThan(1)
      for (const yi of [0, 30, 60]) {
        let inn = 0
        let out = 0
        for (let k = 0; k < data.nDep; k++) {
          inn += res.comps[(yi * data.nDep + k) * N_COMP + COMP_IN]
          out += res.comps[(yi * data.nDep + k) * N_COMP + COMP_OUT]
        }
        expect(Math.abs(inn - out)).toBeLessThan(0.5)
      }
    }
  })

  it('l’outre-mer n’accueille pas les réfugiés du littoral ni de la chaleur', () => {
    const yi = 2070 - data.startYear
    for (const [type, zone] of [
      ['montee-eaux', LITTORAL],
      ['canicules-repetees', SUD],
      ['secheresse', SUD],
    ] as const) {
      const res = simulate(data, emptyScenario({ events: [{ uid: 'x', type, start: 2030, duration: 30, intensity: 1, zone }] }), cat)
      for (const code of ['971', '972', '973', '974', '976']) {
        const rel = totalPop(res, [dep(code)], yi) / totalPop(base, [dep(code)], yi) - 1
        expect(rel, `${type} ${code}`).toBeLessThan(0.005)
      }
    }
  })

  it('la variante « fécondité haute » vise un indicateur de 1,70 enfant par femme, pas 1,17 × la référence', () => {
    const def = EVENT_LIBRARY.find((e) => e.id === 'insee-fecondite-haute')!
    const res = simulate(data, emptyScenario({ events: [{ uid: 'f', type: def.id, start: 2026, duration: 3, intensity: 1, zone: { level: 'france', codes: [] } }] }), cat)
    // naissances 2026 : la cible est atteinte en 3 ans, en partant de l'indicateur de référence (1,53)
    const ratio = (yi: number) => computeIndicators(data, res, FR_ALL, yi).births / computeIndicators(data, base, FR_ALL, yi).births
    expect(ratio(2027 - data.startYear)).toBeLessThan(1.06)
    expect(ratio(2035 - data.startYear)).toBeGreaterThan(1.12)
  })
})
