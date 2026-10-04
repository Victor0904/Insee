import { computeIndicators } from '../../engine/indicators'
import type { ModelData, SimResult } from '../../engine/types'
import { useApp } from '../../state/appStore'
import { Estimated, Term } from '../common/Term'
import { METRICS } from './metrics'
import './Indicators.css'

/** Indicateurs clés avec leur écart à la référence ; chaque chiffre ouvre « D'où vient cet écart ? ». */
export function Indicators({ data, baseline, result, deps, yi }: { data: ModelData; baseline: SimResult; result: SimResult; deps: number[]; yi: number }) {
  const openWhy = useApp((s) => s.openWhy)
  const iS = computeIndicators(data, result, deps, yi)
  const iR = computeIndicators(data, baseline, deps, yi)
  return (
    <ul className="indicators" aria-label="Indicateurs clés">
      {METRICS.filter((m) => m.id !== 'population').map((m) => {
        const v = m.value(iS)
        const r = m.value(iR)
        const d = v - r
        const same = Math.abs(d) < 1e-6 * Math.max(1, Math.abs(r))
        return (
          <li key={m.id} className="ind">
            <span className="ind__label">
              <Term technical={m.technical}>{m.label}</Term>
              {m.estimated && <Estimated how={m.estimated} />}
            </span>
            <button
              type="button"
              className="ind__value"
              onClick={() => openWhy(m.id)}
              aria-label={`${m.label} : ${m.format(v)}${same ? ', comme la référence' : `, référence ${m.format(r)}, écart ${m.diff(d)}`}. D’où vient cet écart ?`}
            >
              <span className="ind__number">{m.format(v)}</span>
              <span className={`ind__diff ${same ? '' : d > 0 ? 'ind__diff--gain' : 'ind__diff--loss'}`}>
                {same ? 'comme la référence' : `${m.diff(d)} vs référence`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
