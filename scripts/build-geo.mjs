// Contours des départements (outre-mer compris) → TopoJSON simplifié et quantifié + superficies (km²),
// dans l'ordre de meta.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { geoArea } from 'd3-geo'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import { feature } from 'topojson-client'

const raw = JSON.parse(readFileSync('.cache/raw/departements-avec-outre-mer.geojson', 'utf8'))
const meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8'))
const R = 6371.0088 // rayon terrestre moyen (km)
/** Part des sommets conservés (les plus significatifs) : 0,04 garde environ 4 % des points. */
const SIMPLIFY_QUANTILE = 0.04

const byCode = new Map(raw.features.map((f) => [f.properties.code, f]))
const features = meta.departments.map((d) => {
  const f = byCode.get(d.code)
  if (!f) throw new Error(`contour manquant pour ${d.code}`)
  return { type: 'Feature', id: d.code, properties: { name: d.name, reg: d.reg }, geometry: f.geometry }
})
// superficie sur les contours complets (avant simplification)
const areas = features.map((f) => {
  let a = geoArea(f)
  if (a > 2 * Math.PI) a = 4 * Math.PI - a // anneau orienté à l'inverse de la convention d3
  return Math.round(a * R * R)
})
// simplification topologique (les frontières communes restent jointives), puis topologie neuve
// sans les poids de simplification, quantifiée sur une grille de 10 000 × 10 000
let work = presimplify(topology({ departements: { type: 'FeatureCollection', features } }, 1e5))
work = simplify(work, quantile(work, SIMPLIFY_QUANTILE))
const simplified = feature(work, work.objects.departements)
const topo = topology({ departements: simplified }, 1e4)
writeFileSync('public/data/departements.topo.json', JSON.stringify(topo))
writeFileSync('public/data/areas.json', JSON.stringify({ note: 'Superficies calculées sur les contours IGN (avant simplification), valeurs approchées.', areaKm2: areas }))
const total = areas.reduce((s, x) => s + x, 0)
console.log(`[build-geo] ${features.length} départements, superficie totale ≈ ${total.toLocaleString('fr-FR')} km², TopoJSON ${(JSON.stringify(topo).length / 1024).toFixed(0)} Ko`)
