import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { useId, useMemo } from 'react'
import { useWidth } from '../hooks/useWidth'
import './LineChart.css'

export interface Series {
  id: string
  label: string
  values: ArrayLike<number>
  /** solid = scénario / moteur, dashed = référence */
  variant: 'solid' | 'dashed'
  color?: string
}

interface Props {
  title: string
  /** Résumé textuel lu par les lecteurs d'écran. */
  summary: string
  years: number[]
  series: Series[]
  format: (v: number) => string
  /** Au-delà de cette année : zone hachurée « au-delà des projections officielles ». */
  officialHorizon?: number
  currentYear?: number
  height?: number
}


export function LineChart({ title, summary, years, series, format, officialHorizon, currentYear, height = 280 }: Props) {
  const uid = useId().replace(/:/g, '')
  const [box, W] = useWidth<HTMLDivElement>()
  const narrow = W < 480
  const M = { top: 20, right: narrow ? 84 : 112, bottom: 32, left: narrow ? 44 : 56 }
  const H = narrow ? Math.round(height * 0.85) : height
  const { x, y, paths, ticksY } = useMemo(() => {
    const all = series.flatMap((s) => Array.from(s.values).filter((v) => Number.isFinite(v)))
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1
    const x = scaleLinear().domain([years[0], years[years.length - 1]]).range([M.left, W - M.right])
    const y = scaleLinear().domain([lo - pad, hi + pad]).range([H - M.bottom, M.top]).nice(5)
    const gen = line<number>()
      .defined((v) => Number.isFinite(v))
      .x((_, i) => x(years[i]))
      .y((v) => y(v))
    return { x, y, paths: series.map((s) => gen(Array.from(s.values)) ?? ''), ticksY: y.ticks(5) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, years, H, W])

  const step = narrow ? 25 : 10
  const ticksX = years.filter((yr) => yr % step === 0)
  const last = years.length - 1
  const lastFinite = (v: ArrayLike<number>) => {
    for (let i = v.length - 1; i >= 0; i--) if (Number.isFinite(v[i])) return i
    return 0
  }
  // libellés directs en fin de courbe (dernier point défini), écartés s'ils se chevauchent
  const labels = series
    .map((s, i) => {
      const li = lastFinite(s.values)
      return { s, i, x: x(years[li]), y: y(s.values[li]) }
    })
    .sort((a, b) => a.y - b.y)
  for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 16) labels[k].y = labels[k - 1].y + 16

  return (
    <figure className="linechart">
      <figcaption className="linechart__title">{title}</figcaption>
      <div ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-desc`} className="linechart__svg">
        <desc id={`${uid}-desc`}>{summary}</desc>
        <defs>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="linechart__hatch" />
          </pattern>
        </defs>
        {officialHorizon !== undefined && officialHorizon < years[last] && (
          <g>
            <rect
              x={x(officialHorizon)}
              y={M.top}
              width={x(years[last]) - x(officialHorizon)}
              height={H - M.top - M.bottom}
              fill={`url(#${uid}-hatch)`}
            />
            <text x={x(officialHorizon) + 6} y={M.top + 14} className="linechart__note">
              {narrow ? "hors projections" : "au-delà des projections officielles"}
            </text>
          </g>
        )}
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="linechart__grid" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="linechart__tick">
              {format(t)}
            </text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={t} x={x(t)} y={H - M.bottom + 20} textAnchor="middle" className="linechart__tick">
            {t}
          </text>
        ))}
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} className="linechart__axis" />
        {currentYear !== undefined && (
          <line x1={x(currentYear)} x2={x(currentYear)} y1={M.top} y2={H - M.bottom} className="linechart__cursor" />
        )}
        {series.map((s, i) => (
          <path
            key={s.id}
            d={paths[i]}
            className={`linechart__line linechart__line--${s.variant}`}
            style={s.color ? { stroke: s.color } : undefined}
          />
        ))}
        {labels.map(({ s, x: lx, y: ly }) => (
          <text key={s.id} x={lx + 8} y={ly} dy="0.32em" className={`linechart__label linechart__label--${s.variant}`}>
            {s.label}
          </text>
        ))}
      </svg>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Année</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years
            .map((yr, i) => ({ yr, i }))
            .filter(({ yr }) => yr % 5 === 0)
            .map(({ yr, i }) => (
              <tr key={yr}>
                <th scope="row">{yr}</th>
                {series.map((s) => (
                  <td key={s.id}>{Number.isFinite(s.values[i]) ? format(s.values[i]) : '—'}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  )
}
