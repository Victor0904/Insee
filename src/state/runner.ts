import { useApp } from './appStore'
import { effectiveScenario, useScenario } from './scenarioStore'
import { recycleResult, runSimulation } from './simClient'
import type { Scenario, SimResult } from '../engine/types'

/**
 * Relance la simulation dans le Worker à chaque changement du scénario (ou de son aperçu).
 * Une seule simulation à la fois : si le scénario change pendant un calcul, on recalcule
 * une fois le calcul fini avec la dernière version (les intermédiaires sont ignorés).
 */
let running = false
let pending: Scenario | null = null

async function pump() {
  if (running || !pending) return
  running = true
  const sc = pending
  pending = null
  useApp.setState({ computing: true })
  try {
    const res = await runSimulation(sc)
    if (res && !pending) {
      const old = useApp.getState().result
      useApp.setState({ result: res, lastRunMs: res.elapsedMs })
      retire(old)
    }
  } catch (e) {
    console.error('Simulation impossible', e)
  } finally {
    running = false
    useApp.setState({ computing: pending !== null })
    void pump()
  }
}

/**
 * Recyclage de l'ancien résultat, deux images plus tard (l'interface a fini de se rendre avec le
 * nouveau). Jamais la référence, ni un résultat encore affiché.
 */
function retire(old: SimResult | null) {
  if (!old) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const { result, baseline } = useApp.getState()
      if (old !== result && old !== baseline && old.pop.byteLength) recycleResult(old)
    }),
  )
}

export function requestSimulation(sc: Scenario) {
  const { baseline } = useApp.getState()
  // sans événement ni aléa, le résultat est la référence : inutile de recalculer
  if (baseline && sc.events.length === 0 && !(sc.randomness > 0)) {
    pending = null
    const old = useApp.getState().result
    useApp.setState({ result: baseline })
    retire(old)
    return
  }
  pending = sc
  void pump()
}

let started = false
export function startRunner() {
  if (started) return
  started = true
  let last = effectiveScenario(useScenario.getState())
  useScenario.subscribe((s) => {
    const sc = effectiveScenario(s)
    if (sc === last) return
    last = sc
    requestSimulation(sc)
  })
  if (last.events.length || last.randomness > 0) requestSimulation(last)
}
