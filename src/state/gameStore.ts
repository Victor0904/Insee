import { create } from 'zustand'
import type { Scenario } from '../engine/types'
import { RENAMED_CHALLENGES } from '../game/challenges'

export type GameMode = 'sandbox' | 'challenges' | 'guess' | 'presets'

interface Best {
  score: number
  stars: number
}

interface GameState {
  mode: GameMode
  challengeId: string | null
  best: Record<string, Best>
  /**
   * Scénario dont le résultat de défi est révélé : le temps a été lancé jusqu'à l'année du défi
   * avec ce scénario. Toute modification le masque de nouveau (il faut relancer le temps).
   */
  revealedFor: Scenario | null
  /** Message bref (aria-live) : contrainte de défi, confirmation… */
  toast: string | null
  setMode: (m: GameMode) => void
  setChallenge: (id: string | null) => void
  recordBest: (id: string, b: Best) => void
  say: (msg: string) => void
}

const read = (): Record<string, Best> => {
  try {
    const raw = JSON.parse(localStorage.getItem('etsi.best') ?? '{}') as Record<string, Best>
    // défis renommés : on reprend le meilleur score enregistré sous l'ancien identifiant
    for (const [old, id] of Object.entries(RENAMED_CHALLENGES))
      if (raw[old] && !raw[id]) {
        raw[id] = raw[old]
        delete raw[old]
      }
    return raw
  } catch {
    return {}
  }
}

let toastTimer = 0

export const useGame = create<GameState>()((set, get) => ({
  mode: 'sandbox',
  challengeId: null,
  best: read(),
  revealedFor: null,
  toast: null,
  setMode: (mode) => set({ mode, revealedFor: null, ...(mode !== 'challenges' ? { challengeId: null } : {}) }),
  setChallenge: (challengeId) => set({ challengeId, revealedFor: null }),
  recordBest: (id, b) => {
    const cur = get().best[id]
    if (cur && cur.score >= b.score) return
    const best = { ...get().best, [id]: b }
    try {
      localStorage.setItem('etsi.best', JSON.stringify(best))
    } catch {
      /* stockage indisponible : meilleur score non mémorisé */
    }
    set({ best })
  },
  say: (toast) => {
    window.clearTimeout(toastTimer)
    set({ toast })
    toastTimer = window.setTimeout(() => set({ toast: null }), 4500)
  },
}))
