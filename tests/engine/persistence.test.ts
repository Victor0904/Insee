import { describe, expect, it } from 'vitest'
import { decodeScenario, encodeScenario, validateScenario } from '../../src/state/persistence'
import type { Scenario } from '../../src/engine/types'

const sc: Scenario = {
  v: 1,
  name: 'Test partagé',
  seed: 42,
  randomness: 0.3,
  events: [
    { uid: 'a', type: 'teletravail', start: 2030, duration: 15, intensity: 1, zone: { level: 'region', codes: ['11'] } },
    { uid: 'b', type: 'perso-x', start: 2040, duration: 10, intensity: 1, zone: { level: 'dep', codes: ['23'] } },
  ],
  custom: [
    {
      id: 'perso-x',
      name: 'Bébés',
      family: 'perso',
      icon: 'custom',
      summary: 's',
      defaults: { duration: 10, intensity: 1, zone: { level: 'france', codes: [] } },
      profile: 'step',
      effects: [{ kind: 'fertility', mult: 1.3 }],
      hypothesis: 'h',
      source: 's',
      estimated: true,
    },
  ],
}

describe('sauvegarde et partage', () => {
  it('le lien de partage restitue exactement le scénario', async () => {
    const code = await encodeScenario(sc)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    console.info(`[partage] scénario de 2 événements → ${code.length} caractères dans l’URL`)
    expect(await decodeScenario(code)).toEqual(sc)
  })

  it('un lien abîmé est refusé proprement', async () => {
    expect(await decodeScenario('nimporte-quoi')).toBeNull()
  })

  it('la validation écarte les types inconnus et borne les valeurs', () => {
    const v = validateScenario({
      v: 1,
      name: 'x'.repeat(500),
      events: [
        { uid: 'a', type: 'inconnu', start: 2030, duration: 5, intensity: 1, zone: { level: 'france' } },
        { uid: 'b', type: 'pandemie', start: 1900, duration: 999, intensity: 50, zone: { level: 'dep', codes: ['23', '<script>'] } },
        { uid: 'c', type: 'pandemie', start: 2030, duration: 2, intensity: 1, zone: { level: 'dep', codes: ['23'] } },
      ],
      custom: [{ id: 'pas-perso', effects: [] }],
    })!
    expect(v.name.length).toBe(60)
    expect(v.events).toHaveLength(1)
    expect(v.events[0]).toMatchObject({ type: 'pandemie', start: 2030, intensity: 1 })
    expect(v.custom).toHaveLength(0)
    expect(validateScenario({ v: 2, events: [] })).toBeNull()
    expect(validateScenario('texte')).toBeNull()
  })
})
