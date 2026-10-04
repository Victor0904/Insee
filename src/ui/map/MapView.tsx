import { useEffect, useId, useMemo, useState } from 'react'
import { mapLegend } from '../scenario/mapLegend'
import { useApp, type LayerId } from '../../state/appStore'
import { useGame } from '../../state/gameStore'
import { Icon } from '../common/Icon'
import { Term } from '../common/Term'
import { ChallengePill } from '../game/ChallengePill'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PALETTES, type Theme } from '../theme'
import { FranceMap } from './FranceMap'
import type { MapGeometry } from './geo'
import { buildScale, layerById, layerMatrix, LAYERS } from './layers'
import './MapView.css'

/** Carte + choix de la couche + légende en cartouche. */
export function MapView({ geom, theme }: { geom: MapGeometry; theme: Theme }) {
  const data = useApp((s) => s.data)!
  const baseline = useApp((s) => s.baseline)!
  const result = useApp((s) => s.result)!
  const year = useApp((s) => s.year)
  const layerId = useApp((s) => s.layer)
  const setLayer = useApp((s) => s.setLayer)
  const showFlows = useApp((s) => s.showFlows)
  const setShowFlows = useApp((s) => s.setShowFlows)
  const selectId = useId()
  const narrow = useMediaQuery('(max-width: 960px)')
  const setPanelOpen = useApp((s) => s.setPanelOpen)
  const panelOpen = useApp((s) => s.panelOpen)
  const libraryOpen = useApp((s) => s.libraryOpen)
  const setLibraryOpen = useApp((s) => s.setLibraryOpen)
  const compare = useApp((s) => s.compare)
  const setCompare = useApp((s) => s.setCompare)
  const [split, setSplit] = useState(50)
  const compareId = useId()
  const mode = useGame((s) => s.mode)

  const layer = layerById(layerId)
  const matrix = useMemo(() => layerMatrix(data, baseline, result, layerId), [data, baseline, result, layerId])
  const scale = useMemo(() => buildScale(layer, matrix, PALETTES[theme]), [layer, matrix, theme])
  useEffect(() => {
    Object.assign(mapLegend, { title: layer.label, colors: scale.colors, labels: scale.labels, hatched: layer.kind === 'signed' ? 4 : 0 })
  }, [layer, scale])
  const yi = year - data.startYear
  const n = data.nDep
  const values = useMemo(() => matrix.subarray(yi * n, (yi + 1) * n), [matrix, yi, n])
  // mode avant / après : même couche et même échelle, à gauche « avant », à droite « après »
  const refMatrix = useMemo(
    () => (compare === 'reference' ? layerMatrix(data, baseline, baseline, layerId) : null),
    [compare, data, baseline, layerId],
  )
  const before = useMemo(() => {
    if (compare === 'reference' && refMatrix) return refMatrix.subarray(yi * n, (yi + 1) * n)
    if (compare === 'years') return matrix.subarray(0, n)
    return null
  }, [compare, refMatrix, matrix, yi, n])
  const flows = useMemo(() => {
    if (!result.flows) return null
    const fy = Math.min(yi, result.nYears - 2)
    return result.flows.subarray(fy * n * n, (fy + 1) * n * n)
  }, [result, yi, n])

  return (
    <section className="mapview" aria-label="Carte de France">
      <div className="mapview__bar">
        <label id={`${selectId}-label`} htmlFor={selectId} className="mapview__label">
          La carte montre
        </label>
        <select id={selectId} className="select" value={layerId} onChange={(e) => setLayer(e.target.value as LayerId)}>
          {LAYERS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="toggle"
          aria-pressed={showFlows}
          onClick={() => setShowFlows(!showFlows)}
          title="Afficher les principaux déménagements entre départements"
        >
          <Icon name="flows" size={18} />
          Flux
        </button>
        <ChallengePill />
        <label htmlFor={compareId} className="sr-only">
          Mode avant / après
        </label>
        <select id={compareId} className="select" value={compare} onChange={(e) => setCompare(e.target.value as typeof compare)}>
          <option value="off">Une seule carte</option>
          <option value="reference">Avant / après : référence | scénario</option>
          <option value="years">Avant / après : 2025 | {year}</option>
        </select>
        <button
          type="button"
          className="toggle mapview__library"
          onClick={() => setLibraryOpen(true)}
          aria-expanded={libraryOpen}
          aria-controls="bibliotheque"
        >
          <Icon name="map" size={18} />
          {mode === 'sandbox' ? 'Événements' : 'Jeu'}
        </button>
        <button
          type="button"
          className="toggle mapview__analysis"
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-controls="analyse"
        >
          <Icon name="chart" size={18} />
          Analyse
        </button>
      </div>
      <div className="mapview__stage">
        {before ? (
          <div className="compare">
            <div className="compare__layer">
              <FranceMap data={data} geom={geom} values={before} scale={scale} layer={layer} theme={theme} flows={null} flowCount={0} decorative />
            </div>
            <div className="compare__layer" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <FranceMap data={data} geom={geom} values={values} scale={scale} layer={layer} theme={theme} flows={null} flowCount={0} />
            </div>
            <div className="compare__divider" style={{ left: `${split}%` }} aria-hidden="true" />
            <span className="compare__tag compare__tag--left" style={{ maxWidth: `calc(${split}% - 16px)` }}>
              {compare === 'reference' ? `Référence ${year}` : `En 2025`}
            </span>
            <span className="compare__tag compare__tag--right" style={{ maxWidth: `calc(${100 - split}% - 16px)` }}>
              {compare === 'reference' ? `Ce scénario ${year}` : `En ${year}`}
            </span>
            <input
              type="range"
              className="compare__range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              aria-label="Séparateur avant / après : à gauche avant, à droite après"
              aria-valuetext={`${split} % de la carte montre l’avant`}
            />
          </div>
        ) : (
          <FranceMap data={data} geom={geom} values={values} scale={scale} layer={layer} theme={theme} flows={flows} flowCount={narrow ? 20 : 36} />
        )}
        <details className="legend" open={!narrow} key={narrow ? 'n' : 'w'}>
          <summary className="legend__title">
            <span>
              <Term technical={layer.technical}>{layer.label}</Term>
            </span>
            <span className="legend__year">{year}</span>
            <span className="legend__strip" aria-hidden="true">
              {scale.colors.map((c, i) => (
                <span key={c + i} style={{ background: c }} />
              ))}
            </span>
          </summary>
          <ol className="legend__classes">
            {scale.colors.map((c, i) => (
              <li key={c + i}>
                <span
                  className={`legend__swatch ${layer.kind === 'signed' && i < 4 ? 'legend__swatch--loss' : ''}`}
                  style={{ background: c }}
                />
                {scale.labels[i]}
              </li>
            ))}
          </ol>
          <p className="legend__note">{layer.explain}</p>
          {layer.kind === 'signed' && <p className="legend__note">Hachures : baisse.</p>}
          {showFlows && <p className="legend__note">Arcs : principaux déménagements nets de l’année.</p>}
        </details>
      </div>
    </section>
  )
}
