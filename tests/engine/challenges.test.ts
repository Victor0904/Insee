import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { CHALLENGES, evaluateChallenge } from '../../src/game/challenges'
import { emptyScenario, loadAll } from './load'

const catalog = catalogFor({ custom: [] })

describe('défis', () => {
  const { data } = loadAll()
  const baseline = simulate(data, emptyScenario(), catalog)

  it('au moins 8 défis', () => expect(CHALLENGES.length).toBeGreaterThanOrEqual(8))

  for (const ch of CHALLENGES) {
    it(`« ${ch.title} » : la référence échoue, la solution réussit`, () => {
      const ref = evaluateChallenge(ch, { data, baseline, result: baseline, scenario: emptyScenario() })
      expect(ref.success).toBe(false)
      const sc = emptyScenario({ events: ch.solution.map((e, i) => ({ ...e, uid: `s${i}` })) })
      const res = simulate(data, sc, catalog)
      const st = evaluateChallenge(ch, { data, baseline, result: res, scenario: sc })
      console.info(`[défi] ${ch.id} : référence ${ref.check.format(ref.check.value)}, solution ${st.check.format(st.check.value)} (cible ${st.check.format(st.check.target)}), score ${st.score}, ${st.stars}★`)
      expect(st.success).toBe(true)
      expect(st.eventsUsed).toBeLessThanOrEqual(ch.maxEvents)
    })
  }

  it('un événement interdit fait échouer le défi même si l’objectif est atteint', () => {
    const ch = CHALLENGES.find((c) => c.id === 'diagonale')!
    const sc = emptyScenario({ events: [{ uid: 'x', type: 'exode-urbain', start: 2026, duration: 40, intensity: 1.5, zone: { level: 'dep', codes: ['75', '92', '93', '94', '69'] } }] })
    const st = evaluateChallenge(ch, { data, baseline, result: simulate(data, sc, catalog), scenario: sc })
    expect(st.forbiddenUsed).toEqual(['exode-urbain'])
    expect(st.success).toBe(false)
  })
})
