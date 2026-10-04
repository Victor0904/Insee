import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { catalogFor } from '../../src/events/catalog'
import { IDF } from '../../src/events/zones'
import { deName, narrate } from '../../src/story/narrative'
import { emptyScenario, loadAll } from './load'

const catalog = catalogFor({ custom: [] })

describe('récit automatique', () => {
  const { data } = loadAll()
  const base = simulate(data, emptyScenario(), catalog, { recordFlows: true })

  it('raconte le télétravail : l’Ouest gagne des habitants venus d’Île-de-France', () => {
    const res = simulate(
      data,
      emptyScenario({ events: [{ uid: 't', type: 'teletravail', start: 2027, duration: 15, intensity: 1, zone: IDF }] }),
      catalog,
      { recordFlows: true },
    )
    const lines = narrate(data, base, res, catalog, { level: 'france' }, 2050 - data.startYear)
    const text = lines.map((l) => l.text).join('\n')
    console.info('[récit]\n' + text)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(text).toMatch(/Île-de-France/)
    expect(text).toMatch(/Télétravail généralisé/)
    const gainLine = lines.find((l) => l.tone === 'gain' && /venus surtout d’Île-de-France/.test(l.text))
    expect(gainLine).toBeTruthy()
  })

  it('ne raconte rien sans événement', () => {
    expect(narrate(data, base, base, catalog, { level: 'france' }, 20)).toEqual([])
  })

  it('accorde les noms de lieux', () => {
    expect(deName('Île-de-France')).toBe('d’Île-de-France')
    expect(deName('Hauts-de-France')).toBe('des Hauts-de-France')
    expect(deName('Bretagne')).toBe('de Bretagne')
  })
})
