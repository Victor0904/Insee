import { useMemo } from 'react'
import { areaDeps } from '../../engine/aggregate'
import { totalPop } from '../../engine/indicators'
import type { ModelData, SimResult } from '../../engine/types'
import { fmtDec1, fmtSigned } from '../../lib/format'
import { useApp } from '../../state/appStore'
import './SmallMultiples.css'

const W = 160
const H = 64

/**
 * Petits multiples : les 13 régions côte à côte, même échelle pour toutes. Évolution de la population
 * depuis 2025 (scénario en trait plein, référence en pointillé), avec l'écart final.
 */
export function SmallMultiples({ data, baseline, result }: { data: ModelData; baseline: SimResult; result: SimResult }) {
  const year = useApp((s) => s.year)
  const select = useApp((s) => s.select)
  const selection = useApp((s) => s.selection)
  const yi = year - data.startYear

  const regions = useMemo(
    () =>
      data.regions.map((r) => {
        const deps = areaDeps(data, { level: 'region', code: r.code })
        const p0 = totalPop(baseline, deps, 0)
        const s: number[] = []
        const b: number[] = []
        for (let y = 0; y < result.nYears; y++) {
          s.push(totalPop(result, deps, y) / p0 - 1)
          b.push(totalPop(baseline, deps, y) / p0 - 1)
        }
        return { ...r, s, b }
      }),
    [data, result, baseline],
  )
  const lo = Math.min(...regions.flatMap((r) => [...r.s, ...r.b]))
  const hi = Math.max(...regions.flatMap((r) => [...r.s, ...r.b]))
  const x = (i: number) => 4 + (i / (result.nYears - 1)) * (W - 8)
  const y = (v: number) => 4 + ((hi - v) / (hi - lo || 1)) * (H - 8)
  const path = (v: number[]) => v.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('')

  return (
    <div className="multiples">
      <p className="multiples__lede">
        Évolution de la population depuis 2025, même échelle pour toutes les régions (de {fmtSigned(100 * lo, fmtDec1)} % à{' '}
        {fmtSigned(100 * hi, fmtDec1)} %). Trait plein : scénario ; pointillé : référence.
      </p>
      <ul className="multiples__grid">
        {regions.map((r) => {
          const d = r.s[yi] - r.b[yi]
          const active = selection.level === 'region' && selection.code === r.code
          return (
            <li key={r.code}>
              <button
                type="button"
                className={`mini ${active ? 'is-active' : ''}`}
                onClick={() => select({ level: 'region', code: r.code })}
                aria-label={`${r.name} : ${fmtSigned(100 * r.s[yi], fmtDec1)} % depuis 2025 en ${year}, ${
                  Math.abs(d) < 5e-4 ? 'comme la référence' : `${fmtSigned(100 * d, fmtDec1)} point par rapport à la référence`
                }. Afficher la région.`}
              >
                <span className="mini__name">{r.name}</span>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none" className="mini__svg">
                  <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="mini__zero" />
                  <line x1={x(yi)} x2={x(yi)} y1={0} y2={H} className="mini__cursor" />
                  <path d={path(r.b)} className="mini__ref" />
                  <path d={path(r.s)} className="mini__line" />
                </svg>
                <span className="mini__value">
                  {fmtSigned(100 * r.s[yi], fmtDec1)} %
                  {Math.abs(d) >= 5e-4 && (
                    <span className={d > 0 ? 'mini__gain' : 'mini__loss'}> ({fmtSigned(100 * d, fmtDec1)} pt)</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
