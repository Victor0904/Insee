import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { areaDeps } from '../../engine/aggregate'
import type { ModelData } from '../../engine/types'
import { useApp } from '../../state/appStore'
import { useSize } from '../hooks/useSize'
import { PALETTES, usePrefersReducedMotion, type Theme } from '../theme'
import { FlowCanvas } from './FlowCanvas'
import { makeProjection, neighborInDirection, projectAll, type MapGeometry } from './geo'
import type { ClassScale, LayerDef } from './layers'
import './FranceMap.css'

interface Props {
  data: ModelData
  geom: MapGeometry
  /** Valeurs de la couche pour l'année affichée, une par département. */
  values: Float64Array
  scale: ClassScale
  layer: LayerDef
  theme: Theme
  /** Flux bruts entre départements de l'année affichée : o * n + d. */
  flows: Float32Array | null
  flowCount: number
}

export function FranceMap({ data, geom, values, scale, layer, theme, flows, flowCount }: Props) {
  const [box, { width, height }] = useSize<HTMLDivElement>()
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const showFlows = useApp((s) => s.showFlows)
  const reduced = usePrefersReducedMotion()
  const [hover, setHover] = useState<{ d: number; x: number; y: number } | null>(null)
  const [focusDep, setFocusDep] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const projected = useMemo(() => {
    if (!width || !height) return null
    return projectAll(geom, makeProjection(geom, width, height))
  }, [geom, width, height])

  const selected = useMemo(() => new Set(areaDeps(data, selection)), [data, selection])
  const selectionOutline = useMemo(() => {
    if (!projected || selection.level === 'france') return ''
    return [...selected].map((d) => projected.paths[d]).join(' ')
  }, [projected, selected, selection.level])

  const fmt = (d: number) => `${data.departments[d].name} : ${Number.isFinite(values[d]) ? layer.format(values[d]) : 'donnée indisponible'}`

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!projected) return
    const cur = focusDep ?? (selection.level === 'dep' ? [...selected][0] : data.departments.findIndex((d) => d.code === '75'))
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }
    if (dirs[e.key]) {
      e.preventDefault()
      const next = focusDep === null ? cur : neighborInDirection(projected.centroids, cur, ...dirs[e.key])
      setFocusDep(next)
    } else if ((e.key === 'Enter' || e.key === ' ') && focusDep !== null) {
      e.preventDefault()
      select({ level: 'dep', code: data.departments[focusDep].code })
    } else if (e.key === 'Escape') {
      select({ level: 'france' })
    }
  }

  const palette = PALETTES[theme]
  const signed = layer.kind === 'signed'

  return (
    <div className="map" ref={box}>
      {projected && (
        <svg
          ref={svgRef}
          className="map__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          tabIndex={0}
          role="application"
          aria-roledescription="carte"
          aria-label={`Carte des départements : ${layer.label}. Flèches pour parcourir, Entrée pour choisir, Échap pour revenir à la France.`}
          onKeyDown={onKey}
          onBlur={() => setFocusDep(null)}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="hatch-loss" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" className="map__hatch" />
            </pattern>
          </defs>
          <g className={`map__deps ${reduced ? '' : 'map__deps--animated'}`}>
            {projected.paths.map((p, d) => (
              <path
                key={data.departments[d].code}
                d={p}
                fill={Number.isFinite(values[d]) ? scale.colors[scale.classOf(values[d])] : 'var(--neutral)'}
                className="map__dep"
                onClick={() => select({ level: 'dep', code: data.departments[d].code })}
                onMouseMove={(e) => {
                  const r = svgRef.current!.getBoundingClientRect()
                  setHover({ d, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
              />
            ))}
          </g>
          {signed && (
            <g className="map__hatches" aria-hidden="true">
              {projected.paths.map((p, d) =>
                values[d] < -1e-9 && scale.classOf(values[d]) < 4 ? <path key={d} d={p} fill="url(#hatch-loss)" /> : null,
              )}
            </g>
          )}
          <path d={projected.regionBorders} className="map__regions" />
          <path d={projected.outline} className="map__outline" />
          {selectionOutline && <path d={selectionOutline} className="map__selection" style={{ stroke: palette.selection }} />}
          {focusDep !== null && <path d={projected.paths[focusDep]} className="map__focus" />}
        </svg>
      )}
      {projected && showFlows && flows && (
        <FlowCanvas
          width={width}
          height={height}
          centroids={projected.centroids}
          flows={flows}
          n={data.nDep}
          color={palette.flow}
          animate={!reduced}
          top={flowCount}
        />
      )}
      {hover && (
        <div className="map__tooltip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <strong>{data.departments[hover.d].name}</strong>
          <span>{Number.isFinite(values[hover.d]) ? layer.format(values[hover.d]) : '—'}</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {focusDep !== null ? fmt(focusDep) : ''}
      </p>
    </div>
  )
}
