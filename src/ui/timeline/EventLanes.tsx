import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { ScenarioEvent } from '../../engine/types'
import { EventIcon } from '../../events/icons'
import { eventDef, removeEvent } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { useDrag } from '../dnd/drag'
import './EventLanes.css'

interface Item {
  ev: ScenarioEvent
  derived: boolean
  lane: number
}

/** Répartit les blocs sur des lignes pour qu'ils ne se chevauchent pas. */
function layout(events: { ev: ScenarioEvent; derived: boolean }[]): Item[] {
  const ends: number[] = []
  return [...events]
    .sort((a, b) => a.ev.start - b.ev.start)
    .map((x) => {
      const end = x.ev.start + Math.max(1, x.ev.duration)
      let lane = ends.findIndex((e) => e <= x.ev.start)
      if (lane < 0) lane = ends.length
      ends[lane] = end
      return { ...x, lane }
    })
}

/** Blocs d'événements posés sur la frise (déplacer : glisser ; durée : poignée de droite ou Maj+flèches). */
export function EventLanes({ y0, y1 }: { y0: number; y1: number }) {
  const events = useScenario((s) => (s.preview ?? s.scenario).events)
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedEvent)
  const selectEvent = useApp((s) => s.selectEvent)
  const dropYear = useDrag((s) => (s.over?.kind === 'timeline' ? s.over.year : null))
  const box = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    const own = new Set(events.map((e) => e.uid))
    const derived = (result?.events ?? []).filter((e) => e.causedBy && !own.has(e.uid))
    return layout([...events.map((ev) => ({ ev, derived: false })), ...derived.map((ev) => ({ ev, derived: true }))])
  }, [events, result])
  const lanes = Math.max(1, ...items.map((i) => i.lane + 1))
  const pct = (y: number) => ((y - y0) / (y1 - y0)) * 100

  const startPointer = (e: PointerEvent, ev: ScenarioEvent, mode: 'move' | 'resize') => {
    if (e.button !== 0 || !box.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = box.current.getBoundingClientRect()
    const perYear = rect.width / (y1 - y0)
    const sx = e.clientX
    let moved = false
    let patch: Partial<ScenarioEvent> = {}
    const name = eventDef(ev.type)?.name ?? ev.type
    const move = (m: globalThis.PointerEvent) => {
      const dy = Math.round((m.clientX - sx) / perYear)
      if (!moved && Math.abs(m.clientX - sx) < 4) return
      moved = true
      patch = mode === 'move' ? { start: ev.start + dy } : { duration: ev.duration + dy }
      useScenario.getState().previewEvent(ev.uid, patch)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) {
        const after = { ...ev, ...patch }
        useScenario
          .getState()
          .updateEvent(ev.uid, patch, mode === 'move' ? `Déplacement : ${name} (${Math.round(after.start)})` : `Durée : ${name} (${Math.round(after.duration)} ans)`)
      } else selectEvent(ev.uid)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKey = (e: KeyboardEvent, ev: ScenarioEvent) => {
    const name = eventDef(ev.type)?.name ?? ev.type
    const upd = useScenario.getState().updateEvent
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step && e.shiftKey) {
      e.preventDefault()
      upd(ev.uid, { duration: ev.duration + step }, `Durée : ${name} (${ev.duration + step} ans)`)
    } else if (step) {
      e.preventDefault()
      upd(ev.uid, { start: ev.start + step }, `Déplacement : ${name} (${ev.start + step})`)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeEvent(ev.uid)
    }
  }

  return (
    <div
      ref={box}
      className="lanes"
      style={{ height: `${lanes * 30 + 4}px` }}
      data-drop="timeline"
      data-y0={y0}
      data-y1={y1}
      role={items.length ? 'list' : undefined}
      aria-label={items.length ? 'Événements posés sur la frise' : undefined}
    >
      {items.length === 0 && <p className="lanes__empty">Glissez un événement ici pour choisir sa date.</p>}
      {dropYear !== null && <span className="lanes__drop" style={{ left: `${pct(dropYear)}%` }} aria-hidden="true" />}
      {items.map(({ ev, derived, lane }) => {
        const def = eventDef(ev.type)
        const name = def?.name ?? ev.type
        const cause = derived ? items.find((i) => i.ev.uid === ev.causedBy)?.ev : undefined
        const causeName = cause ? eventDef(cause.type)?.name : undefined
        const end = Math.min(y1, ev.start + Math.max(1, ev.duration))
        const label = derived
          ? `${name}, de ${ev.start} à ${end}, déclenché par ${causeName ?? 'un autre événement'}`
          : `${name}, de ${ev.start} à ${end}. Flèches : déplacer ; Maj + flèches : durée ; Suppr : retirer ; Entrée : régler.`
        return (
          <div key={ev.uid} role="listitem" className="lanes__slot" style={{ left: `${pct(ev.start)}%`, width: `${pct(end) - pct(ev.start)}%`, top: lane * 30 }}>
            {derived ? (
              <span className={`block block--derived block--${def?.family ?? 'perso'}`} title={label}>
                <span aria-hidden="true" className="block__arrow">↳</span>
                <EventIcon name={def?.icon ?? 'custom'} size={16} />
                <span className="block__name">{name}</span>
                <span className="sr-only">{label}</span>
              </span>
            ) : (
              <button
                type="button"
                className={`block block--${def?.family ?? 'perso'} ${selected === ev.uid ? 'is-selected' : ''}`}
                onPointerDown={(e) => startPointer(e, ev, 'move')}
                onKeyDown={(e) => onKey(e, ev)}
                onClick={(e) => {
                  if (e.detail === 0) selectEvent(ev.uid) // Entrée / Espace
                }}
                aria-label={label}
                title={`${name} (${ev.start}-${end})`}
                aria-pressed={selected === ev.uid}
              >
                <EventIcon name={def?.icon ?? 'custom'} size={16} />
                <span className="block__name">{name}</span>
                <span className="block__handle" onPointerDown={(e) => startPointer(e, ev, 'resize')} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
