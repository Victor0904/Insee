import * as Comlink from 'comlink'
import { compileData } from '../engine/compile'
import { depTotals } from '../engine/decompose'
import { simulate } from '../engine/simulate'
import { WARMUP_SCENARIO } from '../engine/warmup'
import type { ModelData, Scenario, SimResult } from '../engine/types'
import { fetchRawData } from '../data/load'
import { catalogFor } from '../events/catalog'

let data: ModelData | null = null
/** Référence et ses états exacts : point de reprise des simulations suivantes. */
let checkpoint: { result: SimResult; states: Float64Array[] } | null = null
let lastRun = 0

/** Tableaux rendus par la page, réutilisés par longueur (évite le ramasse-miettes). */
const pool = new Map<number, ArrayBuffer[]>()
const alloc = (len: number): Float32Array => {
  const b = pool.get(len * 4)?.pop()
  return b ? new Float32Array(b) : new Float32Array(len)
}

const transferables = (r: SimResult) => [r.pop.buffer, r.comps.buffer, r.retirementAge.buffer, ...(r.flows ? [r.flows.buffer] : [])]

const api = {
  /** Charge et compile les données ; renvoie le scénario de référence (sans événement). */
  async init(): Promise<SimResult> {
    data = compileData(await fetchRawData())
    const { states, ...ref } = simulate(data, { v: 1, name: 'Référence', seed: 1, randomness: 0, events: [], custom: [] }, catalogFor({ custom: [] }), {
      recordFlows: true,
      keepStates: true,
    })
    // copie conservée dans le Worker (l'original est transféré à la page)
    checkpoint = {
      result: { ...ref, pop: ref.pop.slice(), comps: ref.comps.slice(), flows: ref.flows?.slice(), retirementAge: ref.retirementAge.slice() },
      states: states!,
    }
    // échauffement : le scénario WARMUP_SCENARIO exerce tous les types d'effets, pour que le moteur
    // JavaScript optimise d'emblée toutes les branches (sinon, pointes de ~150 ms au premier usage)
    setTimeout(() => {
      if (!data) return
      const cat = catalogFor({ custom: [] })
      for (let i = 0; i < 3; i++) {
        simulate(data, WARMUP_SCENARIO, cat, { recordFlows: true, checkpoint: checkpoint ?? undefined, alloc })
        simulate(data, WARMUP_SCENARIO, cat, { recordFlows: true })
      }
    }, 50)
    return Comlink.transfer(ref, transferables(ref))
  },

  /** Lance une simulation ; renvoie null si une demande plus récente est arrivée entre-temps. */
  run(scenario: Scenario, requestId: number): SimResult | null {
    if (!data) throw new Error('Données non chargées')
    lastRun = Math.max(lastRun, requestId)
    if (requestId < lastRun) return null
    const res = simulate(data, scenario, catalogFor(scenario), { recordFlows: true, checkpoint: checkpoint ?? undefined, alloc })
    return Comlink.transfer(res, transferables(res))
  },

  /** Reprend les tableaux d'un résultat devenu inutile côté page. */
  recycle(buffers: ArrayBuffer[]) {
    for (const b of buffers) {
      if (!b.byteLength) continue
      const list = pool.get(b.byteLength) ?? []
      if (list.length < 3) list.push(b)
      pool.set(b.byteLength, list)
    }
  },

  /** Simulation indépendante (mode Devine) : n'interfère pas avec la file des calculs affichés. */
  runDetached(scenario: Scenario): SimResult {
    if (!data) throw new Error('Données non chargées')
    const res = simulate(data, scenario, catalogFor(scenario), { recordFlows: true, checkpoint: checkpoint ?? undefined })
    return Comlink.transfer(res, transferables(res))
  },

  /**
   * Contrefactuels pour « D'où vient cet écart ? » : pour chaque événement du joueur, totaux par
   * département et par année du scénario privé de cet événement (et donc de ses cascades).
   */
  contributions(scenario: Scenario): { uid: string; totals: Float32Array }[] {
    if (!data) throw new Error('Données non chargées')
    const cat = catalogFor(scenario)
    const out = scenario.events.map((ev) => {
      const r = simulate(data!, { ...scenario, events: scenario.events.filter((e) => e.uid !== ev.uid) }, cat, { checkpoint: checkpoint ?? undefined })
      return { uid: ev.uid, totals: depTotals(r) }
    })
    return Comlink.transfer(out, out.map((o) => o.totals.buffer))
  },
}

export type SimWorkerApi = typeof api
Comlink.expose(api)
