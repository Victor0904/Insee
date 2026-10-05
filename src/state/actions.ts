import type { EventDef, Zone } from '../engine/types'
import { catalogFor } from '../events/catalog'
import { useApp } from './appStore'
import { useScenario } from './scenarioStore'
import { useGame } from './gameStore'
import { challengeById, forbiddenIn } from '../game/challenges'

export const currentCatalog = () => catalogFor(useScenario.getState().scenario)
export const eventDef = (type: string): EventDef | undefined => currentCatalog().get(type)

/**
 * Pose un événement : zone (sinon celle par défaut), année (sinon l'année affichée).
 * L'événement est sélectionné pour que sa fiche s'ouvre ; la carte passe en « écart avec la
 * référence » si le joueur n'a pas encore choisi de couche, pour montrer tout de suite l'effet.
 */
export function placeEvent(type: string, opts: { zone?: Zone; start?: number } = {}): string | null {
  const def = eventDef(type)
  const app = useApp.getState()
  if (!def || !app.data) return null
  const game = useGame.getState()
  const ch = game.mode === 'challenges' && game.challengeId ? challengeById(game.challengeId) : undefined
  if (ch) {
    if (forbiddenIn(ch).includes(type)) {
      game.say(
        def.evidence === 'insee'
          ? `Les variantes Insee sont des cadrages officiels, pas des leviers : elles sont interdites en défi.`
          : `« ${def.name} » est interdit dans ce défi.`,
      )
      useApp.setState({ placing: null })
      return null
    }
    if (useScenario.getState().scenario.events.length >= ch.maxEvents) {
      game.say(`Ce défi autorise ${ch.maxEvents} événements au plus : retirez-en un avant d’en ajouter un autre.`)
      useApp.setState({ placing: null })
      return null
    }
  }
  // une variante officielle se pose par défaut à son année de départ (sauf dépôt sur la frise)
  let start = Math.min(opts.start ?? def.officialStart ?? app.year, app.data.endYear - 1)
  if (ch?.earliestStart && start < ch.earliestStart) start = ch.earliestStart
  // une variante officielle porte toujours sur toute la France
  const official = def.evidence === 'insee'
  if (official && opts.zone && opts.zone.level !== 'france') game.say(`« ${def.name} » est une variante officielle : elle s’applique à toute la France.`)
  const uid = useScenario.getState().addEvent(def, { start, zone: official ? def.defaults.zone : opts.zone })
  useApp.setState({
    placing: null,
    libraryOpen: false,
    selectedEvent: uid,
    ...(app.layerTouched ? {} : { layer: 'delta' as const }),
  })
  return uid
}

export function removeEvent(uid: string) {
  const ev = useScenario.getState().scenario.events.find((e) => e.uid === uid)
  if (!ev) return
  useScenario.getState().removeEvent(uid, eventDef(ev.type)?.name ?? ev.type)
  if (useApp.getState().selectedEvent === uid) useApp.setState({ selectedEvent: null })
}

export const undo = () => useScenario.temporal.getState().undo()
export const redo = () => useScenario.temporal.getState().redo()

/** Raccourcis globaux : Ctrl+Z annuler, Ctrl+Y ou Ctrl+Maj+Z rétablir (hors champs de saisie). */
export function installShortcuts() {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault()
      redo()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
