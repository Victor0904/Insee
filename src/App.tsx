import { useEffect, useMemo, useState } from 'react'
import { compileData } from './engine/compile'
import { computeIndicators, totalPop } from './engine/indicators'
import type { ModelData, ReferenceJson, SimResult } from './engine/types'
import { VALIDATION_THRESHOLDS, validate } from './engine/validation'
import { fetchRawData, fetchReference, fetchSources, type SourceEntry } from './data/load'
import { fmtDec2, fmtMillions, fmtPct } from './lib/format'
import { initSimulation } from './state/simClient'
import { LineChart } from './ui/charts/LineChart'
import './App.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ModelData; baseline: SimResult; reference: ReferenceJson; sources: SourceEntry[]; officialHorizon: number }

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    Promise.all([initSimulation(), fetchRawData(), fetchReference(), fetchSources()])
      .then(([baseline, raw, reference, sources]) => {
        if (alive)
          setState({ status: 'ready', baseline, data: compileData(raw), reference, sources, officialHorizon: raw.meta.officialHorizon })
      })
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__kicker">Simulateur démographique de la France · 2025-2100</p>
        <h1 className="masthead__title">Et si… ?</h1>
        <p className="masthead__lede">
          Jalon 1 : le moteur. Avant de jouer, on vérifie que le scénario « sans événement » ressemble aux projections
          officielles de l’Insee.
        </p>
      </header>
      <main id="contenu">
        {state.status === 'loading' && (
          <p className="status" role="status">
            Chargement des données de l’Insee et calcul du scénario de référence…
          </p>
        )}
        {state.status === 'error' && (
          <p className="status status--error" role="alert">
            Les données n’ont pas pu être chargées : {state.message}
          </p>
        )}
        {state.status === 'ready' && <Validation {...state} />}
      </main>
    </div>
  )
}

function Validation({
  data,
  baseline,
  reference,
  sources,
  officialHorizon,
}: {
  data: ModelData
  baseline: SimResult
  reference: ReferenceJson
  sources: SourceEntry[]
  officialHorizon: number
}) {
  const all = useMemo(() => data.departments.map((_, i) => i), [data])
  const years = useMemo(() => Array.from({ length: baseline.nYears }, (_, i) => data.startYear + i), [data, baseline])
  const report = useMemo(() => validate(data, baseline, reference), [data, baseline, reference])

  const popSeries = useMemo(() => years.map((_, yi) => totalPop(baseline, all, yi)), [years, baseline, all])
  const index = popSeries.map((p) => (100 * p) / popSeries[0])
  const nat = reference.national
  const offBase = nat.total[nat.years.indexOf(data.startYear)]
  const offIndex = years.map((y) => {
    const i = nat.years.indexOf(y)
    return i >= 0 ? (100 * nat.total[i]) / offBase : NaN
  })
  const seniors = years.map((_, yi) => 100 * computeIndicators(data, baseline, all, yi).share65plus)
  const offSeniors = years.map((y) => {
    const i = nat.years.indexOf(y)
    return i >= 0 ? 100 * nat.share65plus[i] : NaN
  })
  const at = (y: number) => popSeries[y - data.startYear]
  const T = VALIDATION_THRESHOLDS
  const omph2050 = report.omphale.find((r) => r.year === 2050)!
  const omph2070 = report.omphale.find((r) => r.year === 2070)!

  const checks = [
    {
      label: 'Évolution de la population, écart maximal à la projection Insee 2026 (2025-2070)',
      value: `${fmtDec2(report.maxNationalGapPts)} point`,
      limit: `${fmtDec2(T.maxNationalGapPts)} point`,
      ok: report.maxNationalGapPts < T.maxNationalGapPts,
    },
    {
      label: 'Part des 65 ans et plus, écart maximal',
      value: `${fmtDec2(report.maxSeniorGapPts)} point`,
      limit: `${fmtDec2(T.maxSeniorGapPts)} point`,
      ok: report.maxSeniorGapPts < T.maxSeniorGapPts,
    },
    {
      label: 'Population 2026 projetée à 1 an contre l’estimation Insee, écart moyen par département',
      value: fmtPct(report.oneYear.meanAbsPct / 100, 2),
      limit: fmtPct(T.oneYearMeanAbsPct / 100, 2),
      ok: report.oneYear.meanAbsPct < T.oneYearMeanAbsPct,
    },
    {
      label: `Même contrôle, écart maximal (${report.oneYear.worst})`,
      value: fmtPct(report.oneYear.maxAbsPct / 100, 2),
      limit: fmtPct(T.oneYearMaxAbsPct / 100, 2),
      ok: report.oneYear.maxAbsPct < T.oneYearMaxAbsPct,
    },
    {
      label: 'Poids des départements contre Omphale en 2050, écart moyen',
      value: fmtPct(omph2050.meanAbsPct / 100, 2),
      limit: fmtPct(T.omphaleMeanAbsPct[2050] / 100, 2),
      ok: omph2050.meanAbsPct < T.omphaleMeanAbsPct[2050],
    },
    {
      label: 'Poids des départements contre Omphale en 2070, écart moyen',
      value: fmtPct(omph2070.meanAbsPct / 100, 2),
      limit: fmtPct(T.omphaleMeanAbsPct[2070] / 100, 2),
      ok: omph2070.meanAbsPct < T.omphaleMeanAbsPct[2070],
    },
  ]

  return (
    <>
      <section className="kpis" aria-label="Scénario de référence, France métropolitaine">
        {[2025, 2050, 2070, 2100].map((y) => (
          <div key={y} className="kpi">
            <span className="kpi__year">{y}</span>
            <span className="kpi__value">{fmtMillions(at(y))}</span>
            <span className="kpi__label">{y === 2025 ? 'habitants (Insee)' : y > officialHorizon ? 'habitants (prolongé)' : 'habitants projetés'}</span>
          </div>
        ))}
      </section>

      <section className="grid2">
        <div className="panel">
          <LineChart
            title="Population, base 100 en 2025"
            summary={`Le moteur (métropole) passe de 100 en 2025 à ${index[2070 - data.startYear].toFixed(1)} en 2070. La projection Insee 2026 pour la France entière atteint ${offIndex[2070 - data.startYear].toFixed(1)}.`}
            years={years}
            series={[
              { id: 'moteur', label: 'Moteur', values: index, variant: 'solid' },
              { id: 'insee', label: 'Insee 2026', values: offIndex, variant: 'dashed' },
            ]}
            format={(v) => v.toFixed(0)}
            officialHorizon={officialHorizon}
          />
          <p className="note">
            Moteur : France métropolitaine. Insee : France entière (avec les DROM, dont la croissance est plus rapide, ce
            qui explique une partie de l’écart).
          </p>
        </div>
        <div className="panel">
          <LineChart
            title="Part des 65 ans et plus (%)"
            summary={`Le moteur projette ${seniors[2070 - data.startYear].toFixed(1)} % de 65 ans et plus en 2070, contre ${offSeniors[2070 - data.startYear].toFixed(1)} % pour l’Insee.`}
            years={years}
            series={[
              { id: 'moteur', label: 'Moteur', values: seniors, variant: 'solid' },
              { id: 'insee', label: 'Insee 2026', values: offSeniors, variant: 'dashed' },
            ]}
            format={(v) => `${v.toFixed(0)} %`}
            officialHorizon={officialHorizon}
          />
          <p className="note">Après 2070 : fécondité et migrations prolongées au niveau de 2070 (hypothèse du jeu).</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Contrôles automatiques</h2>
        <table className="checks">
          <thead>
            <tr>
              <th scope="col">Contrôle</th>
              <th scope="col">Mesuré</th>
              <th scope="col">Seuil</th>
              <th scope="col">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                <td>{c.value}</td>
                <td>&lt; {c.limit}</td>
                <td>
                  <span className={`badge ${c.ok ? 'badge--ok' : 'badge--ko'}`}>
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      {c.ok ? (
                        <path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      ) : (
                        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" />
                      )}
                    </svg>
                    {c.ok ? 'conforme' : 'hors seuil'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Simulation complète 2025-2100 (96 départements × 2 sexes × 101 âges) calculée en{' '}
          <strong>{Math.round(baseline.elapsedMs)} ms</strong> dans le Web Worker.
        </p>
      </section>

      <footer className="sources">
        <h2 className="section-title">Sources</h2>
        <ul>
          {sources.map((s) => (
            <li key={s.id}>
              <a href={s.page}>{s.title}</a> — {s.producer}, {s.date}.
            </li>
          ))}
        </ul>
        <p className="note">Données sous Licence Ouverte / Etalab 2.0.</p>
      </footer>
    </>
  )
}
