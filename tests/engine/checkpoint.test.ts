import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { IDF, SUD } from '../../src/events/zones'
import { emptyScenario, loadAll } from './load'

const cat = catalogFor({ custom: [] })

describe('reprise à partir de la référence', () => {
  const { data } = loadAll()
  const { states, ...ref } = simulate(data, emptyScenario(), cat, { recordFlows: true, keepStates: true })
  const checkpoint = { result: ref, states: states! }

  it('donne exactement le même résultat que le calcul complet', () => {
    const scenarios = [
      emptyScenario({ events: [{ uid: 'a', type: 'teletravail', start: 2040, duration: 15, intensity: 1, zone: IDF }] }),
      emptyScenario({ events: [{ uid: 'b', type: 'canicules-repetees', start: 2030, duration: 12, intensity: 1, zone: SUD }] }),
      emptyScenario({ events: [{ uid: 'c', type: 'reforme-retraites', start: 2026, duration: 10, intensity: 1, zone: { level: 'france', codes: [] } }] }),
    ]
    for (const sc of scenarios) {
      const full = simulate(data, sc, cat, { recordFlows: true })
      const fast = simulate(data, sc, cat, { recordFlows: true, checkpoint })
      expect(Buffer.from(fast.pop.buffer).equals(Buffer.from(full.pop.buffer))).toBe(true)
      expect(Buffer.from(fast.comps.buffer).equals(Buffer.from(full.comps.buffer))).toBe(true)
      expect(Buffer.from(fast.flows!.buffer).equals(Buffer.from(full.flows!.buffer))).toBe(true)
      expect(Array.from(fast.retirementAge)).toEqual(Array.from(full.retirementAge))
    }
  })

  it('avec de l’aléa, la reprise est ignorée (tirages reproductibles depuis 2025)', () => {
    const sc = emptyScenario({ randomness: 0.5, seed: 7, events: [{ uid: 'a', type: 'teletravail', start: 2060, duration: 15, intensity: 1, zone: IDF }] })
    const full = simulate(data, sc, cat)
    const fast = simulate(data, sc, cat, { checkpoint })
    expect(Buffer.from(fast.pop.buffer).equals(Buffer.from(full.pop.buffer))).toBe(true)
  })

  it('un événement tardif ne fait recalculer que les années à partir de son début', () => {
    const sc = emptyScenario({ events: [{ uid: 'a', type: 'teletravail', start: 2070, duration: 15, intensity: 1, zone: IDF }] })
    expect(simulate(data, sc, cat, { recordFlows: true, checkpoint }).computedFrom).toBe(2070)
    expect(simulate(data, sc, cat, { recordFlows: true }).computedFrom).toBe(2025)
  })
})
