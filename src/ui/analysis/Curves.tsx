import { useId, useMemo, useState } from 'react'
import { computeIndicators } from '../../engine/indicators'
import type { ModelData, SimResult } from '../../engine/types'
import { useApp } from '../../state/appStore'
import { LineChart } from '../charts/LineChart'
import { metricById, METRICS, type MetricId } from './metrics'

/** Courbes d'évolution d'un indicateur, scénario contre référence, 2025-2100. */
export function Curves({ data, baseline, result, deps, zone }: { data: ModelData; baseline: SimResult; result: SimResult; deps: number[]; zone: string }) {
  const [id, setId] = useState<MetricId>('population')
  const year = useApp((s) => s.year)
  const horizon = useApp((s) => s.officialHorizon)
  const selId = useId()
  const metric = metricById(id)
  const years = useMemo(() => Array.from({ length: result.nYears }, (_, i) => data.startYear + i), [data, result])
  const { s, r } = useMemo(() => {
    const s: number[] = []
    const r: number[] = []
    for (let yi = 0; yi < result.nYears; yi++) {
      // les flux annuels (naissances…) de 2025 ne sont connus qu'après un an de simulation
      const flow = id === 'births' || id === 'deaths' || id === 'migration'
      s.push(flow && yi === 0 ? NaN : metric.value(computeIndicators(data, result, deps, yi)))
      r.push(flow && yi === 0 ? NaN : metric.value(computeIndicators(data, baseline, deps, yi)))
    }
    return { s, r }
  }, [data, result, baseline, deps, id, metric])
  const scale = Math.max(...s.filter(Number.isFinite).map(Math.abs)) >= 1e6 ? 1e6 : 1
  const last = years.length - 1

  return (
    <div className="curves">
      <label htmlFor={selId} className="field__label">
        Indicateur
      </label>{' '}
      <select id={selId} className="select" value={id} onChange={(e) => setId(e.target.value as MetricId)}>
        {METRICS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.estimated ? ' (estimé)' : ''}
          </option>
        ))}
      </select>
      <LineChart
        title={`${metric.label}${scale > 1 ? ' (millions)' : ''}`}
        summary={`${zone} : ${metric.label.toLowerCase()} ${metric.format(s[last])} en 2100 dans ce scénario, contre ${metric.format(r[last])} dans la référence.`}
        years={years}
        series={[
          { id: 's', label: 'Scénario', values: s.map((v) => v / scale), variant: 'solid' },
          { id: 'r', label: 'Référence', values: r.map((v) => v / scale), variant: 'dashed' },
        ]}
        format={(v) => (scale > 1 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))}
        officialHorizon={horizon}
        currentYear={year}
        height={240}
      />
    </div>
  )
}
