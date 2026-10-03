import type { ModelData } from './types'

export type AreaRef = { level: 'france' } | { level: 'region'; code: string } | { level: 'dep'; code: string }

/** Départements d'une aire (France, région ou département). Agrégation à la volée. */
export function areaDeps(data: ModelData, area: AreaRef): number[] {
  switch (area.level) {
    case 'france':
      return data.departments.map((_, i) => i)
    case 'region':
      return data.departments.flatMap((d, i) => (d.reg === area.code ? [i] : []))
    case 'dep': {
      const i = data.departments.findIndex((d) => d.code === area.code)
      return i >= 0 ? [i] : []
    }
  }
}

export function areaName(data: ModelData, area: AreaRef): string {
  switch (area.level) {
    case 'france':
      return 'France métropolitaine'
    case 'region':
      return data.regions.find((r) => r.code === area.code)?.name ?? area.code
    case 'dep':
      return data.departments.find((d) => d.code === area.code)?.name ?? area.code
  }
}
