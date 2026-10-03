import type { ModelData, Zone } from './types'

/** Indices des départements couverts par une zone. */
export function zoneDeps(data: ModelData, zone: Zone): number[] {
  if (zone.level === 'france') return data.departments.map((_, i) => i)
  if (zone.level === 'region') {
    const regs = new Set(zone.codes)
    return data.departments.flatMap((d, i) => (regs.has(d.reg) ? [i] : []))
  }
  const codes = new Set(zone.codes)
  return data.departments.flatMap((d, i) => (codes.has(d.code) ? [i] : []))
}

export const FRANCE: Zone = { level: 'france', codes: [] }

export function zoneKey(zone: Zone): string {
  return zone.level === 'france' ? 'FR' : `${zone.level}:${[...zone.codes].sort().join(',')}`
}
