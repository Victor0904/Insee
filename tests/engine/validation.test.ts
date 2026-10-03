import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine/simulate'
import { VALIDATION_THRESHOLDS as T, validate } from '../../src/engine/validation'
import { emptyScenario, loadAll, noCatalog } from './load'

describe('validation du scénario de référence', () => {
  const { data, reference } = loadAll()
  const report = validate(data, simulate(data, emptyScenario(), noCatalog), reference)
  const pct = (x: number) => `${x.toFixed(2)} %`

  it('suit les projections nationales Insee 2026 (indice d’évolution)', () => {
    console.info('[validation] indice moteur / officiel :', report.national.map((r) => `${r.year} ${r.engine.toFixed(4)}/${r.official.toFixed(4)} (${r.gapPts >= 0 ? '+' : ''}${r.gapPts.toFixed(2)} pt)`).join(' · '))
    expect(report.maxNationalGapPts).toBeLessThan(T.maxNationalGapPts)
  })

  it('reproduit le vieillissement (part des 65 ans et plus)', () => {
    console.info('[validation] 65+ moteur / officiel :', report.seniors.map((r) => `${r.year} ${pct(100 * r.engine)}/${pct(100 * r.official)}`).join(' · '))
    expect(report.maxSeniorGapPts).toBeLessThan(T.maxSeniorGapPts)
  })

  it('projette 2026 au plus près des estimations départementales Insee', () => {
    console.info(`[validation] 1 an : écart moyen ${pct(report.oneYear.meanAbsPct)}, max ${pct(report.oneYear.maxAbsPct)} (${report.oneYear.worst})`)
    expect(report.oneYear.meanAbsPct).toBeLessThan(T.oneYearMeanAbsPct)
    expect(report.oneYear.maxAbsPct).toBeLessThan(T.oneYearMaxAbsPct)
  })

  it('répartit la population entre départements comme Omphale (écart des parts)', () => {
    for (const r of report.omphale) {
      console.info(`[validation] Omphale ${r.year} : écart moyen des parts ${pct(r.meanAbsPct)}, max ${pct(r.maxAbsPct)} (${r.worst})`)
      const limit = T.omphaleMeanAbsPct[r.year]
      if (limit !== undefined) expect(r.meanAbsPct).toBeLessThan(limit)
    }
  })
})
