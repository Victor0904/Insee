// Contours des départements → TopoJSON quantifié + superficies (km²), dans l'ordre de meta.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { geoArea } from 'd3-geo'
import { topology } from 'topojson-server'

const raw = JSON.parse(readFileSync('.cache/raw/departements.geojson', 'utf8'))
const meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8'))
const R = 6371.0088 // rayon terrestre moyen (km)

const byCode = new Map(raw.features.map((f) => [f.properties.code, f]))
const features = meta.departments.map((d) => {
  const f = byCode.get(d.code)
  if (!f) throw new Error(`contour manquant pour ${d.code}`)
  return { type: 'Feature', id: d.code, properties: { name: d.name, reg: d.reg }, geometry: f.geometry }
})
const areas = features.map((f) => {
  let a = geoArea(f)
  if (a > 2 * Math.PI) a = 4 * Math.PI - a // anneau orienté à l'inverse de la convention d3
  return Math.round(a * R * R)
})
const topo = topology({ departements: { type: 'FeatureCollection', features } }, 1e5)
writeFileSync('public/data/departements.topo.json', JSON.stringify(topo))
writeFileSync('public/data/areas.json', JSON.stringify({ note: 'Superficies calculées sur les contours simplifiés (valeurs approchées).', areaKm2: areas }))
const total = areas.reduce((s, x) => s + x, 0)
console.log(`[build-geo] ${features.length} départements, superficie totale ≈ ${total.toLocaleString('fr-FR')} km²`)
