import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { answerOf, QUIZ, regionChoices, roundScenario } from '../../src/game/quiz'
import { PRESETS } from '../../src/game/presets'
import { emptyScenario, loadAll } from './load'

describe('mode Devine et scénarios célèbres', () => {
  const { data } = loadAll()
  const cat = catalogFor({ custom: [] })
  const base = simulate(data, emptyScenario(), cat)

  it('chaque question a une réponse calculée et la bonne réponse figure parmi les choix', () => {
    for (const [i, r] of QUIZ.entries()) {
      const res = simulate(data, roundScenario(r), cat)
      const a = answerOf(data, base, res, r.question)
      console.info(`[devine] ${r.id} → ${a.id} (${a.detail})`)
      if (r.question.kind === 'region') expect(regionChoices(data, a.id, i + 1).map((c) => c.id)).toContain(a.id)
      else expect(['more', 'less', 'same']).toContain(a.id)
    }
    const ret = QUIZ.find((r) => r.id === 'retraites')!
    expect(answerOf(data, base, simulate(data, roundScenario(ret), cat), ret.question).id).toBe('same')
  })

  it('les scénarios célèbres se simulent sans erreur', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(3)
    for (const p of PRESETS) {
      const sc = p.scenario()
      const res = simulate(data, sc, catalogFor(sc))
      expect(res.clipped).toBeLessThan(100)
      expect(res.events.length).toBeGreaterThanOrEqual(sc.events.length)
    }
  })
})
