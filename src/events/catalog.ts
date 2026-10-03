import type { EventDef, Scenario } from '../engine/types'
import { EVENT_LIBRARY } from './library'

/** Catalogue des événements : bibliothèque + événements personnalisés du scénario. */
export function catalogFor(scenario: Pick<Scenario, 'custom'>): Map<string, EventDef> {
  const m = new Map<string, EventDef>()
  for (const e of EVENT_LIBRARY) m.set(e.id, e)
  for (const e of scenario.custom) m.set(e.id, e)
  return m
}
