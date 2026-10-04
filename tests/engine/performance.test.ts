import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { emptyScenario, loadAll, noCatalog } from './load'

// Fichier séparé : le moteur n'y voit qu'une seule forme d'objet `data`, comme dans le Worker.
describe('performance', () => {
  it('une simulation complète 2025 → 2100 prend moins de 200 ms', () => {
    const { data } = loadAll()
    simulate(data, emptyScenario(), noCatalog) // échauffement du JIT
    for (let i = 0; i < 3; i++) simulate(data, emptyScenario(), noCatalog)
    const runs = Array.from({ length: 5 }, () => simulate(data, emptyScenario(), noCatalog, { recordFlows: true }).elapsedMs)
    const best = Math.min(...runs)
    const median = runs.sort((a, b) => a - b)[2]
    console.info(`[perf] simulation 2025-2100, 101 dép. × 2 sexes × 101 âges : médiane ${median.toFixed(0)} ms, meilleure ${best.toFixed(0)} ms`)
    expect(median).toBeLessThan(200)
  })
})
