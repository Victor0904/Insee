import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileData } from '../../src/engine/compile'
import type { EventDef, ModelData, RawData, ReferenceJson, Scenario } from '../../src/engine/types'

const dir = resolve(__dirname, '../../public/data')
const read = <T>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as T

let cached: { raw: RawData; data: ModelData; reference: ReferenceJson } | null = null

export function loadAll() {
  if (cached) return cached
  const raw: RawData = {
    meta: read('meta.json'),
    population: read('population.json'),
    mortality: read('mortality.json'),
    fertility: read('fertility.json'),
    internal: read('migration_internal.json'),
    external: read('migration_external.json'),
    areaKm2: read<{ areaKm2: number[] }>('areas.json').areaKm2,
  }
  cached = { raw, data: compileData(raw), reference: read('reference.json') }
  return cached
}

export const emptyScenario = (over: Partial<Scenario> = {}): Scenario => ({
  v: 1,
  name: 'test',
  seed: 1,
  randomness: 0,
  events: [],
  custom: [],
  ...over,
})

export const noCatalog = new Map<string, EventDef>()
