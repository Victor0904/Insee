import { useEffect, useId, useMemo, useRef } from 'react'
import type { ScenarioEvent, Zone } from '../../engine/types'
import { zoneKey } from '../../engine/zones'
import { EventIcon } from '../../events/icons'
import { zoneLabel } from '../../events/zoneLabel'
import { NAMED_ZONES } from '../../events/zones'
import { eventDef, removeEvent } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { useGame } from '../../state/gameStore'
import { CHALLENGE_MAX_INTENSITY, challengeById } from '../../game/challenges'
import { Icon } from '../common/Icon'
import { EvidenceBadge } from '../common/Evidence'
import './EventInspector.css'

const INTENSITIES = [
  { v: 0.3, label: 'Faible' },
  { v: 0.6, label: 'Moyenne' },
  { v: 1, label: 'Forte' },
  { v: 1.5, label: 'Extrême' },
]

/** Fiche de réglage de l'événement sélectionné (non modale : la carte reste visible et réagit). */
export function EventInspector() {
  const uid = useApp((s) => s.selectedEvent)
  const selectEvent = useApp((s) => s.selectEvent)
  const data = useApp((s) => s.data)!
  const result = useApp((s) => s.result)
  const selection = useApp((s) => s.selection)
  const ev = useScenario((s) => (s.preview ?? s.scenario).events.find((e) => e.uid === uid))
  const challengeId = useGame((s) => (s.mode === 'challenges' ? s.challengeId : null))
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!uid) return
    closeRef.current?.focus()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useApp.getState().placing) selectEvent(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uid, selectEvent])

  // zones proposées, par groupe : zones du jeu, régions, départements (pour corriger un dépôt
  // tombé sur le voisin, par exemple l'Essonne au lieu de Paris)
  const zones = useMemo(() => {
    type Opt = { key: string; label: string; zone: Zone; group: 'named' | 'region' | 'dep' | 'other' }
    const opts: Opt[] = NAMED_ZONES.map((z) => ({ key: zoneKey(z.zone), label: z.label, zone: z.zone, group: 'named' }))
    const push = (o: Opt) => {
      if (!opts.some((x) => x.key === o.key)) opts.push(o)
    }
    for (const r of [...data.regions].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      push({ key: zoneKey({ level: 'region', codes: [r.code] }), label: r.name, zone: { level: 'region', codes: [r.code] }, group: 'region' })
    for (const d of data.departments)
      push({ key: zoneKey({ level: 'dep', codes: [d.code] }), label: `${d.code} · ${d.name}${selection.level === 'dep' && selection.code === d.code ? ' (sélection)' : ''}`, zone: { level: 'dep', codes: [d.code] }, group: 'dep' })
    if (ev) push({ key: zoneKey(ev.zone), label: zoneLabel(data, ev.zone), zone: ev.zone, group: 'other' })
    return opts
  }, [data, selection, ev])
  const groups = [
    { id: 'named', label: 'Zones du jeu' },
    { id: 'other', label: 'Zone actuelle' },
    { id: 'region', label: 'Régions' },
    { id: 'dep', label: 'Départements' },
  ] as const

  if (!uid || !ev) return null
  const def = eventDef(ev.type)
  if (!def) return null
  const st = useScenario.getState()
  const preview = (patch: Partial<ScenarioEvent>) => st.previewEvent(ev.uid, patch)
  const commit = (patch: Partial<ScenarioEvent>, label: string) => useScenario.getState().updateEvent(ev.uid, patch, label)
  const end = Math.min(data.endYear, ev.start + ev.duration)
  const spawned = (result?.events ?? []).filter((e) => e.causedBy === ev.uid)
  const pulse = def.profile === 'pulse'
  const nearest = INTENSITIES.reduce((a, b) => (Math.abs(b.v - ev.intensity) < Math.abs(a.v - ev.intensity) ? b : a)).v
  // Variante Insee : intensité et zone verrouillées (sinon elle sort du cadre officiel tout en
  // gardant son badge). En défi, l'intensité est plafonnée à « forte » sauf pour un événement imposé.
  const official = def.evidence === 'insee'
  const challenge = challengeId ? challengeById(challengeId) : undefined
  const capped = !!challenge && !(challenge.required ?? []).includes(def.id)
  const intensities = INTENSITIES.filter((i) => !capped || i.v <= CHALLENGE_MAX_INTENSITY || i.v === nearest)

  return (
    <section className="inspector" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <header className="inspector__head">
        <span className="inspector__icon">
          <EventIcon name={def.icon} />
        </span>
        <div>
          <h2 id={titleId} className="inspector__title">
            {def.name}
          </h2>
          <p className="inspector__summary">{def.summary}</p>
          <EvidenceBadge def={def} ev={ev} />
        </div>
        <button ref={closeRef} type="button" className="icon-btn" onClick={() => selectEvent(null)} aria-label="Fermer la fiche">
          <Icon name="close" />
        </button>
      </header>

      <div className="inspector__grid">
        <label className="field">
          <span className="field__label">
            Début <strong>{ev.start}</strong>
          </span>
          <input
            type="range"
            min={data.startYear}
            max={data.endYear - 1}
            value={ev.start}
            onChange={(e) => preview({ start: Number(e.target.value) })}
            onPointerUp={(e) => commit({ start: Number((e.target as HTMLInputElement).value) }, `Début : ${def.name} (${(e.target as HTMLInputElement).value})`)}
            onKeyUp={(e) => commit({ start: Number((e.target as HTMLInputElement).value) }, `Début : ${def.name} (${(e.target as HTMLInputElement).value})`)}
          />
        </label>
        {!pulse && (
          <label className="field">
            <span className="field__label">
              Durée <strong>{ev.duration} an{ev.duration > 1 ? 's' : ''}</strong> <span className="field__hint">jusqu’en {end}</span>
            </span>
            <input
              type="range"
              min={1}
              max={50}
              value={ev.duration}
              onChange={(e) => preview({ duration: Number(e.target.value) })}
              onPointerUp={(e) => commit({ duration: Number((e.target as HTMLInputElement).value) }, `Durée : ${def.name}`)}
              onKeyUp={(e) => commit({ duration: Number((e.target as HTMLInputElement).value) }, `Durée : ${def.name}`)}
            />
            {def.persistent && <span className="field__hint">L’effet se maintient après la fin.</span>}
          </label>
        )}
        {official ? (
          <p className="field inspector__locked">
            <span className="field__label">Intensité et zone</span>
            <span>
              <strong>Officielles</strong> : toute la France, au niveau de la variante Insee. Pour explorer d’autres réglages, utilisez un événement
              comme « Politique nataliste » ou « Ouverture migratoire ».
            </span>
          </p>
        ) : (
        <fieldset className="field">
          <legend className="field__label">Intensité</legend>
          <div className="segmented">
            {intensities.map((i) => (
              <label key={i.v} className="segmented__opt">
                <input
                  type="radio"
                  name={`int-${ev.uid}`}
                  checked={nearest === i.v}
                  onChange={() => commit({ intensity: i.v }, `Intensité : ${def.name} (${i.label.toLowerCase()})`)}
                />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
          {capped && <span className="field__hint">En défi, l’intensité va jusqu’à « forte ».</span>}
        </fieldset>
        )}
        {!official && (
        <label className="field">
          <span className="field__label">Zone</span>
          <select
            className="select"
            value={zoneKey(ev.zone)}
            onChange={(e) => {
              const z = zones.find((o) => o.key === e.target.value)
              if (z) commit({ zone: z.zone }, `Zone : ${def.name} (${z.label})`)
            }}
          >
            {groups.map((g) => {
              const list = zones.filter((z) => z.group === g.id)
              return list.length ? (
                <optgroup key={g.id} label={g.label}>
                  {list.map((z) => (
                    <option key={z.key} value={z.key}>
                      {z.label}
                    </option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
          <span className="field__hint">Ou glissez de nouveau une carte de la bibliothèque sur un département.</span>
        </label>
        )}
      </div>

      {spawned.length > 0 && (
        <div className="inspector__cascade" role="note">
          <strong>Effets en cascade :</strong>
          <ul>
            {spawned.map((s) => {
              const sd = eventDef(s.type)
              const rule = def.cascades?.find((c) => c.spawn === s.type)
              return (
                <li key={s.uid}>
                  {sd?.name} en {s.start} ({zoneLabel(data, s.zone)}) — {rule?.because}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {spawned.length === 0 && def.cascades?.length ? (
        <p className="inspector__hint">
          Peut déclencher : {def.cascades.map((c) => `${eventDef(c.spawn)?.name} (après ${c.afterYears} ans, intensité au moins ${c.minIntensity >= 0.6 ? 'moyenne' : 'faible'})`).join(' ; ')}.
        </p>
      ) : null}

      <details className="inspector__more">
        <summary>Hypothèse et source</summary>
        <p>{def.hypothesis}</p>
        <p className="inspector__source">
          {def.source}
        </p>
      </details>

      <footer className="inspector__foot">
        <button type="button" className="btn-secondary btn-danger" onClick={() => removeEvent(ev.uid)}>
          Retirer
        </button>
        <button type="button" className="btn-secondary" onClick={() => selectEvent(null)}>
          Terminé
        </button>
      </footer>
    </section>
  )
}
