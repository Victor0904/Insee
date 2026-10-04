import { create } from 'zustand'
import type { AreaRef } from '../engine/aggregate'
import type { ModelData, ReferenceJson, SimResult } from '../engine/types'
import type { Topology } from 'topojson-specification'

export type LayerId = 'delta' | 'growth' | 'medianAge' | 'seniors' | 'migration' | 'density'
export type ThemePref = 'system' | 'light' | 'dark'

export interface AppState {
  status: 'loading' | 'ready' | 'error'
  error?: string
  data: ModelData | null
  reference: ReferenceJson | null
  topo: Topology | null
  officialHorizon: number
  /** Scénario de référence (sans événement). */
  baseline: SimResult | null
  /** Scénario du joueur (égal à la référence tant qu'aucun événement n'est posé). */
  result: SimResult | null

  year: number
  playing: boolean
  speed: 1 | 2 | 4
  selection: AreaRef
  layer: LayerId
  showFlows: boolean
  theme: ThemePref
  panelOpen: boolean // tiroir d'analyse sur petit écran
  libraryOpen: boolean // tiroir de la bibliothèque sur écran moyen ou petit
  computing: boolean
  lastRunMs: number
  /** Événement en cours de placement (mode « choisir la zone »). */
  placing: { type: string; start?: number } | null
  /** Événement sélectionné (fiche de réglage ouverte). */
  selectedEvent: string | null
  /** Le joueur a choisi lui-même une couche de carte (on ne la change plus automatiquement). */
  layerTouched: boolean

  setYear: (y: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: 1 | 2 | 4) => void
  select: (a: AreaRef) => void
  setLayer: (l: LayerId) => void
  setShowFlows: (v: boolean) => void
  setTheme: (t: ThemePref) => void
  setPanelOpen: (v: boolean) => void
  setLibraryOpen: (v: boolean) => void
  setPlacing: (p: AppState['placing']) => void
  selectEvent: (uid: string | null) => void
}

const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

const writePref = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const useApp = create<AppState>()((set, get) => ({
  status: 'loading',
  data: null,
  reference: null,
  topo: null,
  officialHorizon: 2070,
  baseline: null,
  result: null,

  year: 2025,
  playing: false,
  speed: 1,
  selection: { level: 'france' },
  layer: 'growth',
  showFlows: !reducedMotion(),
  theme: readPref('etsi.theme', ['system', 'light', 'dark'] as const, 'system'),
  panelOpen: false,
  libraryOpen: false,
  computing: false,
  lastRunMs: 0,
  placing: null,
  selectedEvent: null,
  layerTouched: false,

  setYear: (y) => {
    const d = get().data
    if (!d) return
    set({ year: Math.max(d.startYear, Math.min(d.endYear, Math.round(y))) })
  },
  setPlaying: (p) => {
    const { data, year } = get()
    // relancer depuis le début si on est au bout de la frise
    if (p && data && year >= data.endYear) set({ year: data.startYear })
    set({ playing: p })
  },
  setSpeed: (s) => set({ speed: s }),
  select: (a) => set({ selection: a }),
  setLayer: (l) => set({ layer: l, layerTouched: true }),
  setShowFlows: (v) => set({ showFlows: v }),
  setTheme: (t) => {
    writePref('etsi.theme', t)
    set({ theme: t })
  },
  setPanelOpen: (v) => set({ panelOpen: v }),
  setLibraryOpen: (v) => set({ libraryOpen: v }),
  setPlacing: (p) => set({ placing: p, libraryOpen: false }),
  selectEvent: (uid) => set({ selectedEvent: uid }),
}))
