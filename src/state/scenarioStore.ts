import { create } from 'zustand'
import { temporal } from 'zundo'
import type { EventDef, Scenario, ScenarioEvent, Zone } from '../engine/types'

export const emptyScenario = (): Scenario => ({ v: 1, name: 'Mon scénario', seed: 1, randomness: 0, events: [], custom: [] })

let counter = 0
export const newUid = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`

interface ScenarioState {
  scenario: Scenario
  /** Libellé de la dernière action (historique lisible). */
  label: string
  /** Aperçu non enregistré dans l'historique (glissement en cours). */
  preview: Scenario | null

  addEvent: (def: EventDef, at: { start: number; zone?: Zone }) => string
  updateEvent: (uid: string, patch: Partial<ScenarioEvent>, label?: string) => void
  previewEvent: (uid: string, patch: Partial<ScenarioEvent>) => void
  cancelPreview: () => void
  removeEvent: (uid: string, name: string) => void
  addCustom: (def: EventDef) => void
  setScenario: (s: Scenario, label: string) => void
  setRandomness: (r: number, seed?: number) => void
  clear: () => void
}

const clampEvent = (e: ScenarioEvent): ScenarioEvent => ({
  ...e,
  start: Math.max(2025, Math.min(2099, Math.round(e.start))),
  duration: Math.max(1, Math.min(75, Math.round(e.duration))),
  intensity: Math.max(0.1, Math.min(2, Math.round(e.intensity * 100) / 100)),
})

export const useScenario = create<ScenarioState>()(
  temporal(
    (set, get) => ({
      scenario: emptyScenario(),
      label: 'Scénario vide',
      preview: null,

      addEvent: (def, { start, zone }) => {
        const uid = newUid()
        const ev = clampEvent({ uid, type: def.id, start, duration: def.defaults.duration, intensity: def.defaults.intensity, zone: zone ?? def.defaults.zone })
        set((s) => ({ scenario: { ...s.scenario, events: [...s.scenario.events, ev] }, label: `Ajout : ${def.name} (${ev.start})`, preview: null }))
        return uid
      },
      updateEvent: (uid, patch, label) =>
        set((s) => {
          const events = s.scenario.events.map((e) => (e.uid === uid ? clampEvent({ ...e, ...patch }) : e))
          return { scenario: { ...s.scenario, events }, label: label ?? 'Réglage d’un événement', preview: null }
        }),
      previewEvent: (uid, patch) => {
        const base = get().scenario
        set({ preview: { ...base, events: base.events.map((e) => (e.uid === uid ? clampEvent({ ...e, ...patch }) : e)) } })
      },
      cancelPreview: () => set({ preview: null }),
      removeEvent: (uid, name) =>
        set((s) => ({
          scenario: { ...s.scenario, events: s.scenario.events.filter((e) => e.uid !== uid) },
          label: `Suppression : ${name}`,
          preview: null,
        })),
      addCustom: (def) =>
        set((s) => ({ scenario: { ...s.scenario, custom: [...s.scenario.custom.filter((c) => c.id !== def.id), def] }, label: `Création : ${def.name}` })),
      setScenario: (scenario, label) => set({ scenario, label, preview: null }),
      setRandomness: (randomness, seed) =>
        set((s) => ({ scenario: { ...s.scenario, randomness, seed: seed ?? s.scenario.seed }, label: randomness > 0 ? 'Aléa activé' : 'Aléa désactivé' })),
      clear: () => set({ scenario: { ...emptyScenario(), name: get().scenario.name }, label: 'Tout effacer', preview: null }),
    }),
    {
      // seuls le scénario et le libellé de l'action entrent dans l'historique (illimité)
      partialize: (s) => ({ scenario: s.scenario, label: s.label }),
      equality: (a, b) => a.scenario === b.scenario,
    },
  ),
)

/** Scénario à simuler : l'aperçu en cours s'il existe, sinon le scénario enregistré. */
export const effectiveScenario = (s: ScenarioState) => s.preview ?? s.scenario
