import { useEffect, useRef } from 'react'
import { zoneLabel } from '../../events/zoneLabel'
import { eventDef, placeEvent } from '../../state/actions'
import { useApp } from '../../state/appStore'
import './PlacementBar.css'

/** Bandeau du mode « placer » : choisir la zone d'un événement sans glisser-déposer. */
export function PlacementBar() {
  const placing = useApp((s) => s.placing)
  const data = useApp((s) => s.data)!
  const selection = useApp((s) => s.selection)
  const year = useApp((s) => s.year)
  const setPlacing = useApp((s) => s.setPlacing)
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!placing) return
    // différé : une boîte de dialogue qui se ferme rend d'abord le focus à son bouton d'ouverture
    const t = window.setTimeout(() => first.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [placing, setPlacing])

  if (!placing) return null
  const def = eventDef(placing.type)
  if (!def) return null
  const start = placing.start ?? year
  const selZone =
    selection.level === 'dep'
      ? { level: 'dep' as const, codes: [selection.code] }
      : selection.level === 'region'
        ? { level: 'region' as const, codes: [selection.code] }
        : null

  return (
    <div className="placing" role="dialog" aria-label={`Placer : ${def.name}`}>
      <p className="placing__text">
        <strong>Où placer « {def.name} » ?</strong> Cliquez sur un département de la carte (ou parcourez-la au clavier
        puis Entrée), ou choisissez :
      </p>
      <div className="placing__actions">
        <button ref={first} type="button" className="btn-primary" onClick={() => placeEvent(def.id, { zone: def.defaults.zone, start })}>
          {zoneLabel(data, def.defaults.zone)}
          <span className="placing__tag">conseillé</span>
        </button>
        {def.defaults.zone.level !== 'france' && (
          <button type="button" className="btn-secondary" onClick={() => placeEvent(def.id, { zone: { level: 'france', codes: [] }, start })}>
            Toute la France
          </button>
        )}
        {selZone && (
          <button type="button" className="btn-secondary" onClick={() => placeEvent(def.id, { zone: selZone, start })}>
            {zoneLabel(data, selZone)}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => setPlacing(null)}>
          Annuler
        </button>
      </div>
      <p className="placing__year">Début : {start} (année affichée)</p>
    </div>
  )
}
