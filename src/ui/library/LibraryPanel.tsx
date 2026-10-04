import { useState } from 'react'
import type { EventDef } from '../../engine/types'
import { EventIcon } from '../../events/icons'
import { FAMILY_LABELS, LIBRARY_VISIBLE } from '../../events/library'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { beginDrag } from '../dnd/drag'
import './LibraryPanel.css'

type Filter = 'tous' | EventDef['family']

export function LibraryPanel({ onCreate, hidden = [], compact = false }: { onCreate: () => void; hidden?: string[]; compact?: boolean }) {
  const custom = useScenario((s) => s.scenario.custom)
  const setPlacing = useApp((s) => s.setPlacing)
  const [filter, setFilter] = useState<Filter>('tous')
  const all = [...LIBRARY_VISIBLE, ...custom].filter((e) => !hidden.includes(e.id))
  const families = (['tous', 'sante', 'climat', 'economie', 'politique', 'societe', 'imprevu', ...(custom.length ? ['perso'] : [])] as Filter[])
  const shown = filter === 'tous' ? all : all.filter((e) => e.family === filter)

  return (
    <section className={`library ${compact ? 'library--compact' : ''}`} aria-labelledby="library-title">
      <div className="library__head">
        <h2 id="library-title" className={compact ? 'library__title library__title--small' : 'library__title'}>
          {compact ? 'Vos leviers' : 'Événements'}
        </h2>
        <p className="library__help">Glissez une carte sur un département ou sur la frise, ou choisissez « Placer ».</p>
      </div>
      <div className="library__filters" role="group" aria-label="Filtrer par famille">
        {families.map((f) => (
          <button key={f} type="button" className="filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'tous' ? 'Tous' : FAMILY_LABELS[f]}
          </button>
        ))}
      </div>
      <ul className="library__list">
        {shown.map((def) => (
          <li key={def.id}>
            <article
              className={`ev-card ev-card--${def.family}`}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button, summary')) return
                beginDrag(def.id, e)
              }}
              aria-labelledby={`ev-${def.id}`}
            >
              <span className="ev-card__icon">
                <EventIcon name={def.icon} />
              </span>
              <div className="ev-card__body">
                <h3 id={`ev-${def.id}`} className="ev-card__name">
                  {def.name}
                </h3>
                <p className="ev-card__summary">{def.summary}</p>
                <details className="ev-card__more">
                  <summary>Hypothèse et source</summary>
                  <p>{def.hypothesis}</p>
                  <p className="ev-card__source">{def.source}</p>
                  {def.cascades?.length ? (
                    <p className="ev-card__source">Peut entraîner : {def.cascades.map((c) => c.because).join(' ')}</p>
                  ) : null}
                </details>
              </div>
              <button type="button" className="ev-card__place" onClick={() => setPlacing({ type: def.id })} aria-label={`Placer : ${def.name}`}>
                Placer
              </button>
            </article>
          </li>
        ))}
      </ul>
      <button type="button" className="library__create" onClick={onCreate}>
        <EventIcon name="custom" size={18} />
        Créer mon événement
      </button>
    </section>
  )
}
