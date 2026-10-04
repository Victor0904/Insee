import { useId, useMemo } from 'react'
import { areaDeps, areaName, type AreaRef } from '../../engine/aggregate'
import { computeIndicators, totalPop, type Indicators } from '../../engine/indicators'
import { fmtDec1, fmtInt, fmtMillions, fmtSigned } from '../../lib/format'
import { useApp } from '../../state/appStore'
import { LineChart } from '../charts/LineChart'
import { Estimated, Term } from '../common/Term'
import { StoryBlock } from '../story/StoryBlock'
import './ZonePanel.css'

const encode = (a: AreaRef) => (a.level === 'france' ? 'FR' : `${a.level}:${a.code}`)
const decode = (v: string): AreaRef => {
  if (v === 'FR') return { level: 'france' }
  const [level, code] = v.split(':')
  return level === 'region' ? { level: 'region', code } : { level: 'dep', code }
}

interface Kpi {
  label: string
  technical: string
  value: (i: Indicators) => number
  format: (v: number) => string
  /** Écart affiché en valeur absolue (points, ans…) plutôt qu'en %. */
  diff?: (v: number) => string
  estimated?: string
}

const KPIS: Kpi[] = [
  {
    label: 'Âge médian',
    technical: 'Âge médian : la moitié de la population est plus jeune',
    value: (i) => i.medianAge,
    format: (v) => `${fmtDec1(v)} ans`,
    diff: (v) => `${fmtSigned(v, fmtDec1)} an`,
  },
  {
    label: 'Seniors pour 100 actifs',
    technical: 'Rapport de dépendance des âgés : 65 ans et plus / 20-64 ans × 100',
    value: (i) => i.seniorsPer100Workers,
    format: (v) => fmtInt(v),
    diff: (v) => fmtSigned(v, fmtDec1),
  },
  {
    label: 'Naissances dans l’année',
    technical: 'Naissances vivantes domiciliées',
    value: (i) => i.births,
    format: fmtInt,
  },
  {
    label: 'Décès dans l’année',
    technical: 'Décès domiciliés',
    value: (i) => i.deaths,
    format: fmtInt,
  },
  {
    label: 'Arrivées moins départs',
    technical: 'Solde migratoire (interne et extérieur)',
    value: (i) => i.migrationBalance,
    format: (v) => fmtSigned(v),
  },
]

export function ZonePanel() {
  const data = useApp((s) => s.data)!
  const baseline = useApp((s) => s.baseline)!
  const result = useApp((s) => s.result)!
  const year = useApp((s) => s.year)
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const horizon = useApp((s) => s.officialHorizon)
  const pickId = useId()

  const deps = useMemo(() => areaDeps(data, selection), [data, selection])
  const yi = year - data.startYear
  const ind = computeIndicators(data, result, deps, yi)
  const ref = computeIndicators(data, baseline, deps, yi)
  const pop0 = totalPop(result, deps, 0)
  const years = useMemo(() => Array.from({ length: result.nYears }, (_, i) => data.startYear + i), [data, result])
  const series = useMemo(
    () => ({
      scen: years.map((_, i) => totalPop(result, deps, i) / 1e6),
      base: years.map((_, i) => totalPop(baseline, deps, i) / 1e6),
    }),
    [years, result, baseline, deps],
  )
  const regionOfSel =
    selection.level === 'dep' ? data.departments.find((d) => d.code === selection.code)?.reg : selection.level === 'region' ? selection.code : undefined
  const name = areaName(data, selection)
  const delta = ind.population - ref.population
  const same = Math.abs(delta) < 0.5

  return (
    <section className="zone" aria-labelledby="zone-title">
      {selection.level !== 'france' && (
      <nav className="zone__crumbs" aria-label="Niveau géographique">
        <button type="button" className="crumb" onClick={() => select({ level: 'france' })}>
          France
        </button>
        {regionOfSel && (
          <>
            <span aria-hidden="true">›</span>
            <button
              type="button"
              className="crumb"
              onClick={() => select({ level: 'region', code: regionOfSel })}
              aria-current={selection.level === 'region' ? 'true' : undefined}
            >
              {data.regions.find((r) => r.code === regionOfSel)?.name}
            </button>
          </>
        )}
      </nav>
      )}
      <h2 id="zone-title" className="zone__title">
        {name}
      </h2>
      <label htmlFor={pickId} className="sr-only">
        Choisir une autre zone
      </label>
      <select id={pickId} className="select zone__pick" value={encode(selection)} onChange={(e) => select(decode(e.target.value))}>
        <option value="FR">France métropolitaine</option>
        <optgroup label="Régions">
          {data.regions.map((r) => (
            <option key={r.code} value={`region:${r.code}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
        {data.regions.map((r) => (
          <optgroup key={r.code} label={`Départements — ${r.name}`}>
            {data.departments
              .filter((d) => d.reg === r.code)
              .map((d) => (
                <option key={d.code} value={`dep:${d.code}`}>
                  {d.name} ({d.code})
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <div className="zone__headline">
        <p className="zone__pop">
          <span className="zone__pop-value">{ind.population >= 1e6 ? fmtMillions(ind.population) : fmtInt(ind.population)}</span>
          <span className="zone__pop-label">habitants au 1er janvier {year}</span>
        </p>
        <p className="zone__compare">
          {same ? (
            <span className="chip chip--ref">comme la référence</span>
          ) : (
            <span className={`chip ${delta > 0 ? 'chip--gain' : 'chip--loss'}`}>
              {fmtSigned(delta)} par rapport à la référence
            </span>
          )}
          <span className="zone__since">
            {fmtSigned((100 * (ind.population - pop0)) / pop0, fmtDec1)} % depuis 2025
          </span>
        </p>
        {year > horizon && <p className="zone__warn">Au-delà de 2070 : hypothèses prolongées par le jeu.</p>}
      </div>

      <StoryBlock />

      <LineChart
        title="Habitants (millions)"
        summary={`${name} : ${fmtDec1(series.scen[0])} million(s) en 2025, ${fmtDec1(series.scen[series.scen.length - 1])} en 2100 dans ce scénario, ${fmtDec1(series.base[series.base.length - 1])} dans la référence.`}
        years={years}
        series={[
          { id: 'scen', label: 'Scénario', values: series.scen, variant: 'solid' },
          { id: 'base', label: 'Référence', values: series.base, variant: 'dashed' },
        ]}
        format={(v) => fmtDec1(v)}
        officialHorizon={horizon}
        currentYear={year}
        height={200}
      />

      <dl className="zone__kpis">
        {KPIS.map((k) => {
          const v = k.value(ind)
          const r = k.value(ref)
          const d = v - r
          return (
            <div key={k.label} className="kpi-row">
              <dt>
                <Term technical={k.technical}>{k.label}</Term>
                {k.estimated && <Estimated how={k.estimated} />}
              </dt>
              <dd>
                <span className="kpi-row__value">{k.format(v)}</span>
                <span className="kpi-row__ref">
                  {Math.abs(d) < 1e-6 * Math.max(1, Math.abs(r)) ? 'référence : identique' : `référence : ${k.format(r)} (${k.diff ? k.diff(d) : fmtSigned(d)})`}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
