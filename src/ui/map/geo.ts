import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

export interface DepProps {
  name: string
  reg: string
}

export interface MapGeometry {
  features: Feature<Geometry, DepProps>[]
  regionBorders: MultiLineString
  outline: MultiLineString
}

/** Prépare les entités GeoJSON une fois pour toutes (ordre identique à meta.json). */
export function prepareGeometry(topo: Topology): MapGeometry {
  const obj = topo.objects.departements as GeometryCollection<DepProps>
  const fc = feature(topo, obj) as FeatureCollection<Geometry, DepProps>
  return {
    features: fc.features,
    regionBorders: mesh(topo, obj, (a, b) => a !== b && (a.properties as DepProps).reg !== (b.properties as DepProps).reg),
    outline: mesh(topo, obj, (a, b) => a === b),
  }
}

/** Projection conique conforme centrée sur la France (proche de Lambert-93), ajustée à la boîte. */
export function makeProjection(geom: MapGeometry, width: number, height: number, pad = 12): GeoProjection {
  return geoConicConformal()
    .parallels([44, 49])
    .rotate([-3, 0])
    .fitExtent(
      [
        [pad, pad],
        [Math.max(pad + 1, width - pad), Math.max(pad + 1, height - pad)],
      ],
      { type: 'FeatureCollection', features: geom.features },
    )
}

export function projectAll(geom: MapGeometry, projection: GeoProjection) {
  const path = geoPath(projection)
  return {
    paths: geom.features.map((f) => path(f) ?? ''),
    centroids: geom.features.map((f) => path.centroid(f) as [number, number]),
    regionBorders: path(geom.regionBorders) ?? '',
    outline: path(geom.outline) ?? '',
  }
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
