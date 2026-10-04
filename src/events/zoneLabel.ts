import type { ModelData, Zone } from '../engine/types'
import { zoneKey } from '../engine/zones'
import { NAMED_ZONES } from './zones'

/** Nom lisible d'une zone : « Toute la France », « Littoral », « Bretagne », « Creuse », « 3 départements ». */
export function zoneLabel(data: ModelData, zone: Zone): string {
  if (zone.level === 'france') return 'Toute la France'
  const named = NAMED_ZONES.find((z) => zoneKey(z.zone) === zoneKey(zone))
  if (named) return named.label
  if (zone.codes.length === 1) {
    if (zone.level === 'region') return data.regions.find((r) => r.code === zone.codes[0])?.name ?? zone.codes[0]
    return data.departments.find((d) => d.code === zone.codes[0])?.name ?? zone.codes[0]
  }
  return zone.level === 'region' ? `${zone.codes.length} régions` : `${zone.codes.length} départements`
}
