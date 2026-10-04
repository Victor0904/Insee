import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { areaDeps } from '../../engine/aggregate'
import type { ModelData } from '../../engine/types'
import { zoneDeps } from '../../engine/zones'
import { placeEvent } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { useDrag } from '../dnd/drag'
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
  /** Carte d'arrière-plan du mode avant / après : ni focus, ni clic, ni annonce. */
  decorative?: boolean
}

export function FranceMap({ data, geom, values, scale, layer, theme, flows, flowCount, decorative = false }: Props) {
  const [box, { width, height }] = useSize<HTMLDivElement>()
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const showFlows = useApp((s) => s.showFlows)
  const reduced = usePrefersReducedMotion()
  const [hover, setHover] = useState<{ d: number; x: number; y: number } | null>(null)
  const [focusDep, setFocusDep] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const placing = useApp((s) => s.placing)
  const selectedEvent = useApp((s) => s.selectedEvent)
  const year = useApp((s) => s.year)
  const events = useScenario((s) => s.scenario.events)
  const dragOver = useDrag((s) => (s.over?.kind === 'map' ? s.over.dep : null))

  /** Clic ou Entrée sur un département : placer l'événement en attente, sinon choisir la zone. */
  const activate = (d: number) => {
    const code = data.departments[d].code
    if (placing) placeEvent(placing.type, { zone: { level: 'dep', codes: [code] }, start: placing.start ?? year })
    else select({ level: 'dep', code })
  }

  const projected = useMemo(() => {
    if (!width || !height) return null
    return projectAll(geom, makeProjection(geom, width, height))
  }, [geom, width, height])

  const selected = useMemo(() => new Set(areaDeps(data, selection)), [data, selection])
  const selectionOutline = useMemo(() => {
    if (!projected || selection.level === 'france') return ''
    return [...selected].map((d) => projected.paths[d]).join(' ')
  }, [projected, selected, selection.level])

  const eventZone = useMemo(() => {
    if (!projected || !selectedEvent) return ''
    const ev = events.find((e) => e.uid === selectedEvent)
    return ev ? zoneDeps(data, ev.zone).map((d) => projected.paths[d]).join(' ') : ''
  }, [projected, selectedEvent, events, data])

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
      activate(focusDep)
    } else if (e.key === 'Escape') {
      select({ level: 'france' })
    }
  }

  const palette = PALETTES[theme]
  const signed = layer.kind === 'signed'

  return (
    <div className={`map ${placing ? 'map--placing' : ''} ${decorative ? 'map--decorative' : ''}`} ref={box} aria-hidden={decorative || undefined}>
      {projected && (
        <svg
          ref={svgRef}
          className="map__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          tabIndex={decorative ? -1 : 0}
          role={decorative ? undefined : 'application'}
          aria-roledescription={decorative ? undefined : 'carte'}
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
                data-dep={d}
                onClick={() => activate(d)}
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
          {eventZone && <path d={eventZone} className="map__event-zone" />}
          {dragOver !== null && <path d={projected.paths[dragOver]} className="map__drop" />}
          {focusDep !== null && <path d={projected.paths[focusDep]} className="map__focus" />}
        </svg>
      )}
      {projected && showFlows && flows && !decorative && (
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
