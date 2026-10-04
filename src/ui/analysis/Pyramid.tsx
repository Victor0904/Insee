import { useMemo } from 'react'
import { pyramid } from '../../engine/indicators'
import { AGES, type SimResult } from '../../engine/types'
import { fmtInt } from '../../lib/format'
import { useWidth } from '../hooks/useWidth'
import { usePrefersReducedMotion } from '../theme'
import './Pyramid.css'

interface Props {
  baseline: SimResult
  result: SimResult
  deps: number[]
  yi: number
  year: number
  zone: string
}

/** Profil en escalier d'un côté de la pyramide (x négatif pour les hommes). */
function stepPath(v: ArrayLike<number>, x: (v: number) => number, y: (a: number) => number, close: boolean) {
  let d = `M${x(0)},${y(0)}`
  for (let a = 0; a < AGES; a++) d += `L${x(v[a])},${y(a)}L${x(v[a])},${y(a + 1)}`
  d += `L${x(0)},${y(AGES)}`
  return close ? d + 'Z' : d
}

/** Pyramide des âges : scénario en plein, référence en pointillé ; même échelle toute la période. */
export function Pyramid({ baseline, result, deps, yi, year, zone }: Props) {
  const [box, W] = useWidth<HTMLDivElement>(340)
  const reduced = usePrefersReducedMotion()
  const H = 300
  const mid = W / 2
  const gap = 22 // couloir central des âges

  // échelle fixe : maximum sur toutes les années, scénario et référence
  const max = useMemo(() => {
    let m = 1
    for (let y = 0; y < result.nYears; y += 3)
      for (const r of [result, baseline]) {
        const [h, f] = pyramid(r, deps, y)
        for (let a = 0; a < AGES; a++) m = Math.max(m, h[a], f[a])
      }
    return m * 1.05
  }, [result, baseline, deps])

  const [sh, sf] = useMemo(() => pyramid(result, deps, yi), [result, deps, yi])
  const [rh, rf] = useMemo(() => pyramid(baseline, deps, yi), [baseline, deps, yi])
  const half = mid - gap / 2 - 8
  const y = (a: number) => H - 18 - (a / AGES) * (H - 30)
  const xm = (v: number) => mid - gap / 2 - (v / max) * half
  const xf = (v: number) => mid + gap / 2 + (v / max) * half

  const groups = Array.from({ length: 10 }, (_, g) => {
    const lo = g * 10
    const hi = g === 9 ? 100 : lo + 9
    let s = 0
    let r = 0
    for (let a = lo; a <= hi; a++) {
      s += sh[a] + sf[a]
      r += rh[a] + rf[a]
    }
    return { label: g === 9 ? '90 ans et plus' : `${lo}-${hi} ans`, s, r }
  })
  const biggest = [...groups].sort((a, b) => Math.abs(b.s - b.r) - Math.abs(a.s - a.r))[0]

  return (
    <figure className="pyramid">
      <figcaption className="pyramid__title">Pyramide des âges, {year}</figcaption>
      <div ref={box}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Pyramide des âges de ${zone} en ${year}. ${
            Math.abs(biggest.s - biggest.r) < 1
              ? 'Identique à la référence.'
              : `Plus grand écart avec la référence : ${biggest.label}, ${fmtInt(biggest.s)} contre ${fmtInt(biggest.r)}.`
          }`}
          className={reduced ? '' : 'pyramid--animated'}
        >
          {[0, 20, 40, 60, 80, 100].map((a) => (
            <g key={a}>
              <line x1={8} x2={W - 8} y1={y(a)} y2={y(a)} className="pyramid__grid" />
              <text x={mid} y={y(a)} dy="0.32em" textAnchor="middle" className="pyramid__age">
                {a}
              </text>
            </g>
          ))}
          <path d={stepPath(sh, xm, y, true)} className="pyramid__fill pyramid__fill--h" />
          <path d={stepPath(sf, xf, y, true)} className="pyramid__fill pyramid__fill--f" />
          <path d={stepPath(rh, xm, y, false)} className="pyramid__ref" />
          <path d={stepPath(rf, xf, y, false)} className="pyramid__ref" />
          <text x={12} y={14} className="pyramid__side">
            Hommes
          </text>
          <text x={W - 12} y={14} textAnchor="end" className="pyramid__side">
            Femmes
          </text>
          <text x={mid} y={H - 2} textAnchor="middle" className="pyramid__axis">
            âge
          </text>
        </svg>
      </div>
      <p className="pyramid__legend">
        <span className="pyramid__key pyramid__key--fill" aria-hidden="true" /> ce scénario
        <span className="pyramid__key pyramid__key--ref" aria-hidden="true" /> référence (Insee)
      </p>
      <table className="sr-only">
        <caption>Population par tranche d’âge en {year}</caption>
        <thead>
          <tr>
            <th scope="col">Âge</th>
            <th scope="col">Scénario</th>
            <th scope="col">Référence</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.label}</th>
              <td>{fmtInt(g.s)}</td>
              <td>{fmtInt(g.r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
