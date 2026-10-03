import type { RawData, ReferenceJson } from '../engine/types'

const base = `${import.meta.env.BASE_URL}data/`

async function get<T>(file: string): Promise<T> {
  const r = await fetch(base + file)
  if (!r.ok) throw new Error(`Impossible de charger ${file} (${r.status})`)
  return (await r.json()) as T
}

/** Charge toutes les données nécessaires au moteur. Utilisable dans le Worker comme dans la page. */
export async function fetchRawData(): Promise<RawData> {
  const [meta, population, mortality, fertility, internal, external, areas] = await Promise.all([
    get<RawData['meta']>('meta.json'),
    get<RawData['population']>('population.json'),
    get<RawData['mortality']>('mortality.json'),
    get<RawData['fertility']>('fertility.json'),
    get<RawData['internal']>('migration_internal.json'),
    get<RawData['external']>('migration_external.json'),
    get<{ areaKm2: number[] }>('areas.json'),
  ])
  return { meta, population, mortality, fertility, internal, external, areaKm2: areas.areaKm2 }
}

export const fetchReference = () => get<ReferenceJson>('reference.json')

export interface SourceEntry {
  id: string
  title: string
  producer: string
  date: string
  page: string
  use: string
  licence?: string
}

export const fetchSources = () => get<SourceEntry[]>('sources.json')
