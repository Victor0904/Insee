import type { Scenario } from '../engine/types'
import { useApp } from '../state/appStore'
import { useGame, type GameMode } from '../state/gameStore'
import { emptyScenario, newUid, useScenario } from '../state/scenarioStore'
import { CHALLENGE_START, challengeById } from './challenges'
import { presetById } from './presets'

/** Charge un scénario (action annulable) et prépare l'affichage. */
function show(sc: Scenario, label: string, year: number) {
  useScenario.getState().setScenario(sc, label)
  const app = useApp.getState()
  useApp.setState({
    year,
    playing: false,
    selectedEvent: null,
    placing: null,
    compare: 'off',
    selection: { level: 'france' },
    ...(app.layerTouched ? {} : { layer: 'delta' as const }),
  })
}

export function setMode(mode: GameMode) {
  useGame.getState().setMode(mode)
  // Devine part d'une carte vierge (le scénario précédent reste dans l'historique : Ctrl+Z)
  if (mode === 'guess') {
    const app = useApp.getState()
    show(emptyScenario(), 'Mode Devine', app.data?.startYear ?? 2025)
  }
  useApp.setState({ libraryOpen: true, placing: null, selectedEvent: null })
}

export function startChallenge(id: string) {
  const ch = challengeById(id)
  const app = useApp.getState()
  if (!ch || !app.data) return
  useGame.setState({ mode: 'challenges', challengeId: id, revealedFor: null })
  const events = (CHALLENGE_START[id] ?? []).map((e) => ({ ...e, uid: newUid() }))
  show({ ...emptyScenario(), name: `Défi : ${ch.title}`, events }, `Début du défi : ${ch.title}`, app.data.startYear)
}

export function leaveChallenge() {
  useGame.setState({ challengeId: null, revealedFor: null })
}

/** Lance le temps pour révéler le résultat du défi (depuis le début si l'année est déjà dépassée). */
export function runChallenge() {
  const id = useGame.getState().challengeId
  const ch = id ? challengeById(id) : undefined
  const app = useApp.getState()
  if (!ch || !app.data) return
  if (app.year >= ch.year) useApp.setState({ year: app.data.startYear })
  useApp.getState().setPlaying(true)
}

export function loadPreset(id: string) {
  const p = presetById(id)
  if (!p) return
  show(p.scenario(), `Scénario : ${p.title}`, p.year)
}
