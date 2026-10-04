import * as Comlink from 'comlink'
import type { Scenario, SimResult } from '../engine/types'
import type { SimWorkerApi } from '../worker/sim.worker'

/** Client unique du Worker de simulation. */
let api: Comlink.Remote<SimWorkerApi> | null = null
let counter = 0

function worker() {
  if (!api) {
    const w = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module', name: 'simulation' })
    api = Comlink.wrap<SimWorkerApi>(w)
  }
  return api
}

export const initSimulation = (): Promise<SimResult> => worker().init()

/** Lance une simulation ; renvoie null si une demande plus récente l'a rendue obsolète. */
export async function runSimulation(scenario: Scenario): Promise<SimResult | null> {
  const id = ++counter
  const res = await worker().run(scenario, id)
  return id === counter ? res : null
}

/** Contrefactuels « sans tel événement » (calculés à la demande, mis en cache par scénario). */
const contribCache = new WeakMap<Scenario, Promise<{ uid: string; totals: Float32Array }[]>>()
export function computeContributions(scenario: Scenario) {
  let p = contribCache.get(scenario)
  if (!p) {
    p = worker().contributions(scenario)
    contribCache.set(scenario, p)
  }
  return p
}
