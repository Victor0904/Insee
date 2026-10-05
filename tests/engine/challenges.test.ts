import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { CHALLENGES, CHALLENGE_START, evaluateChallenge, forbiddenIn } from '../../src/game/challenges'
import { LIBRARY_VISIBLE } from '../../src/events/library'
import { DIAGONALE, FRANCE, IDF } from '../../src/events/zones'
import type { Zone } from '../../src/engine/types'
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

  // Retour de test : chaque défi se gagnait avec une seule carte. Aucun événement seul (intensité
  // forte au plus, zone par défaut, toute la France ou la zone visée, durée par défaut ou jusqu'à
  // l'année du défi) ne doit suffire.
  const ck = (() => {
    const r = simulate(data, emptyScenario(), catalog, { keepStates: true })
    return { result: r, states: r.states! }
  })()
  for (const ch of CHALLENGES) {
    it(`« ${ch.title} » : aucun événement seul ne suffit`, () => {
      const pre = (CHALLENGE_START[ch.id] ?? []).map((e, i) => ({ ...e, uid: `p${i}` }))
      const target: Zone[] = ch.id === 'creuse' ? [{ level: 'dep', codes: ['23'] }] : ch.id === 'diagonale' ? [DIAGONALE] : ch.id === 'idf' ? [IDF] : []
      const winners: string[] = []
      for (const def of LIBRARY_VISIBLE) {
        if (forbiddenIn(ch).includes(def.id)) continue
        const zones = [def.defaults.zone, FRANCE, ...target]
        for (const zone of zones)
          for (const duration of new Set([1, def.defaults.duration, Math.min(50, ch.year - 2026)])) {
            const sc = emptyScenario({ events: [...pre, { uid: 'x', type: def.id, start: ch.earliestStart ?? 2026, duration, intensity: 1, zone }] })
            const st = evaluateChallenge(ch, { data, baseline, result: simulate(data, sc, catalog, { checkpoint: ck }), scenario: sc })
            if (st.success) winners.push(`${def.id} (${zone.level}, ${duration} ans)`)
          }
      }
      expect(winners).toEqual([])
    }, 120_000)
  }

  it('l’intensité extrême et les variantes Insee sont refusées en défi', () => {
    const ch = CHALLENGES.find((c) => c.id === 'pas-de-declin')!
    for (const ev of [
      { uid: 'a', type: 'politique-nataliste', start: 2026, duration: 50, intensity: 1.5, zone: FRANCE },
      { uid: 'b', type: 'insee-fecondite-haute', start: 2026, duration: 3, intensity: 1, zone: FRANCE },
    ]) {
      const sc = emptyScenario({ events: [ev] })
      const st = evaluateChallenge(ch, { data, baseline, result: simulate(data, sc, catalog), scenario: sc })
      expect(st.success).toBe(false)
      expect(st.tooStrong.length + st.forbiddenUsed.length).toBe(1)
    }
  })

  it('un événement interdit fait échouer le défi même si l’objectif est atteint', () => {
    const ch = CHALLENGES.find((c) => c.id === 'diagonale')!
    const sc = emptyScenario({ events: [{ uid: 'x', type: 'exode-urbain', start: 2026, duration: 40, intensity: 1, zone: { level: 'dep', codes: ['75', '92', '93', '94', '69'] } }] })
    const st = evaluateChallenge(ch, { data, baseline, result: simulate(data, sc, catalog), scenario: sc })
    expect(st.forbiddenUsed).toEqual(['exode-urbain'])
    expect(st.success).toBe(false)
  })
})
