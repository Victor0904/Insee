import * as Comlink from 'comlink'
import { compileData } from '../engine/compile'
import { depTotals } from '../engine/decompose'
import { simulate } from '../engine/simulate'
import type { ModelData, Scenario, SimResult } from '../engine/types'
import { fetchRawData } from '../data/load'
import { catalogFor } from '../events/catalog'

let data: ModelData | null = null
let lastRun = 0

const transferables = (r: SimResult) => [r.pop.buffer, r.comps.buffer, r.retirementAge.buffer, ...(r.flows ? [r.flows.buffer] : [])]

const api = {
  /** Charge et compile les données ; renvoie le scénario de référence (sans événement). */
  async init(): Promise<SimResult> {
    data = compileData(await fetchRawData())
    const ref = simulate(data, { v: 1, name: 'Référence', seed: 1, randomness: 0, events: [], custom: [] }, catalogFor({ custom: [] }), { recordFlows: true })
    return Comlink.transfer(ref, transferables(ref))
  },

  /** Lance une simulation ; renvoie null si une demande plus récente est arrivée entre-temps. */
  run(scenario: Scenario, requestId: number): SimResult | null {
    if (!data) throw new Error('Données non chargées')
    lastRun = Math.max(lastRun, requestId)
    if (requestId < lastRun) return null
    const res = simulate(data, scenario, catalogFor(scenario), { recordFlows: true })
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
      const r = simulate(data!, { ...scenario, events: scenario.events.filter((e) => e.uid !== ev.uid) }, cat)
      return { uid: ev.uid, totals: depTotals(r) }
    })
    return Comlink.transfer(out, out.map((o) => o.totals.buffer))
  },
}

export type SimWorkerApi = typeof api
Comlink.expose(api)
