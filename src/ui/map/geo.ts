import { geoConicConformal, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

export interface DepProps {
  name: string
  reg: string
}

export interface MapGeometry {
  features: Feature<Geometry, DepProps>[]
  /** Vrai pour un département d'outre-mer (dessiné en médaillon). */
  isDrom: boolean[]
  regionBorders: MultiLineString
  outline: MultiLineString
}

const DROM_CODES = new Set(['971', '972', '973', '974', '976'])

/** Prépare les entités GeoJSON une fois pour toutes (ordre identique à meta.json). */
export function prepareGeometry(topo: Topology): MapGeometry {
  const obj = topo.objects.departements as GeometryCollection<DepProps>
  const fc = feature(topo, obj) as FeatureCollection<Geometry, DepProps>
  const drom = (g: { id?: string | number }) => DROM_CODES.has(String(g.id))
  return {
    features: fc.features,
    isDrom: fc.features.map((f) => DROM_CODES.has(String(f.id))),
    regionBorders: mesh(topo, obj, (a, b) => a !== b && (a.properties as DepProps).reg !== (b.properties as DepProps).reg),
    // contour extérieur de la métropole seulement (les DROM ont leur propre cadre)
    outline: mesh(topo, obj, (a, b) => a === b && !drom(a)),
  }
}

export interface Inset {
  index: number
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface Projected {
  paths: string[]
  centroids: [number, number][]
  regionBorders: string
  outline: string
  insets: Inset[]
}

const LABEL_H = 14

/**
 * Mise en page atlas : la métropole en projection conique conforme (proche de Lambert-93), les
 * départements d'outre-mer en médaillons (Mercator, chacun à sa propre échelle), en rangée en haut.
 */
export function projectAll(geom: MapGeometry, width: number, height: number, pad = 12): Projected {
  const drom = geom.features.map((f, i) => ({ f, i })).filter((x) => geom.isDrom[x.i])
  const metro = geom.features.filter((_, i) => !geom.isDrom[i])
  // rangée de médaillons en haut de la carte (la légende occupe le coin inférieur gauche)
  const gap = 8
  const insets: Inset[] = []
  const w = Math.min(110, (width - 2 * pad - gap * (drom.length - 1)) / drom.length)
  const h = Math.max(52, Math.min(84, height * 0.14))
  const x0 = pad + (width - 2 * pad - (w * drom.length + gap * (drom.length - 1))) / 2
  drom.forEach(({ f, i }, k) => insets.push({ index: i, name: f.properties.name, x: x0 + k * (w + gap), y: pad, w, h }))
  const metroBox: [[number, number], [number, number]] = [
    [pad, pad + h + gap],
    [width - pad, height - pad],
  ]
  const metroProj: GeoProjection = geoConicConformal()
    .parallels([44, 49])
    .rotate([-3, 0])
    .fitExtent(metroBox, { type: 'FeatureCollection', features: metro })
  const metroPath = geoPath(metroProj)

  const paths: string[] = []
  const centroids: [number, number][] = []
  const byIndex = new Map(insets.map((b) => [b.index, b]))
  geom.features.forEach((f, i) => {
    const box = byIndex.get(i)
    if (!box) {
      paths[i] = metroPath(f) ?? ''
      centroids[i] = metroPath.centroid(f) as [number, number]
      return
    }
    const proj = geoMercator().fitExtent(
      [
        [box.x + 4, box.y + 4],
        [box.x + box.w - 4, box.y + box.h - LABEL_H - 2],
      ],
      f,
    )
    const p = geoPath(proj)
    paths[i] = p(f) ?? ''
    centroids[i] = p.centroid(f) as [number, number]
  })
  return { paths, centroids, regionBorders: metroPath(geom.regionBorders) ?? '', outline: metroPath(geom.outline) ?? '', insets }
}

/** Département voisin dans une direction (flèches du clavier), d'après les centroïdes. */
export function neighborInDirection(centroids: [number, number][], from: number, dx: number, dy: number): number {
  const [x0, y0] = centroids[from]
  let best = from
  let bestScore = Infinity
  centroids.forEach(([x, y], i) => {
    if (i === from) return
    const vx = x - x0
    const vy = y - y0
    const dist = Math.hypot(vx, vy)
    const cos = (vx * dx + vy * dy) / (dist || 1)
    if (cos < 0.5) return // cône de ±60°
    const score = dist * (2 - cos)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
