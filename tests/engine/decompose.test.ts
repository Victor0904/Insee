import { describe, expect, it } from 'vitest'
import { areaDeps } from '../../src/engine/aggregate'
import { decompose, depTotals, eventContributions } from '../../src/engine/decompose'
import { simulate } from '../../src/engine/simulate'
import type { Scenario } from '../../src/engine/types'
import { catalogFor } from '../../src/events/catalog'
import { IDF } from '../../src/events/zones'
import { emptyScenario, loadAll } from './load'

const catalog = catalogFor({ custom: [] })

describe('« D’où vient cet écart ? »', () => {
  const { data } = loadAll()
  const base = simulate(data, emptyScenario(), catalog)
  const sc: Scenario = emptyScenario({
    events: [
      { uid: 'a', type: 'teletravail', start: 2027, duration: 15, intensity: 1, zone: IDF },
      { uid: 'b', type: 'politique-nataliste', start: 2030, duration: 20, intensity: 0.6, zone: { level: 'france', codes: [] } },
    ],
  })
  const res = simulate(data, sc, catalog)
  const yi = 2050 - data.startYear

  it('les composantes expliquent exactement l’écart de population', () => {
    for (const area of [areaDeps(data, { level: 'region', code: '53' }), areaDeps(data, { level: 'france' }), areaDeps(data, { level: 'dep', code: '75' })]) {
      const dec = decompose(base, res, area, yi)
      expect(Math.abs(dec.residual)).toBeLessThan(Math.max(50, Math.abs(dec.delta) * 1e-4))
    }
  })

  it('en Bretagne, l’écart vient surtout des arrivées ; en France, des naissances', () => {
    const bzh = decompose(base, res, areaDeps(data, { level: 'region', code: '53' }), yi)
    const top = [...bzh.parts].sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0]
    expect(top.key).toBe('in')
    const fr = decompose(base, res, areaDeps(data, { level: 'france' }), yi)
    expect([...fr.parts].filter((p) => p.key !== 'in' && p.key !== 'out').sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0].key).toBe('births')
    // les migrations internes s'annulent à l'échelle de la France
    expect(Math.abs(fr.parts.find((p) => p.key === 'in')!.value + fr.parts.find((p) => p.key === 'out')!.value)).toBeLessThan(5)
  })

  it('la part de chaque événement se mesure par contrefactuel et s’additionne presque', () => {
    const full = depTotals(res)
    const without = sc.events.map((ev) => ({ uid: ev.uid, totals: depTotals(simulate(data, { ...sc, events: sc.events.filter((e) => e.uid !== ev.uid) }, catalog)) }))
    const bzh = areaDeps(data, { level: 'region', code: '53' })
    const contrib = eventContributions(full, without, data.nDep, bzh, yi)
    const dec = decompose(base, res, bzh, yi)
    const sum = contrib.reduce((s, c) => s + c.value, 0)
    expect(contrib.find((c) => c.uid === 'a')!.value).toBeGreaterThan(contrib.find((c) => c.uid === 'b')!.value)
    // effets croisés faibles devant l'écart total
    expect(Math.abs(dec.delta - sum)).toBeLessThan(Math.abs(dec.delta) * 0.05)
  })
})
