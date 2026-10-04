import { create } from 'zustand'

export type GameMode = 'sandbox' | 'challenges' | 'guess' | 'presets'

interface Best {
  score: number
  stars: number
}

interface GameState {
  mode: GameMode
  challengeId: string | null
  best: Record<string, Best>
  /** Message bref (aria-live) : contrainte de défi, confirmation… */
  toast: string | null
  setMode: (m: GameMode) => void
  setChallenge: (id: string | null) => void
  recordBest: (id: string, b: Best) => void
  say: (msg: string) => void
}

const read = (): Record<string, Best> => {
  try {
    return JSON.parse(localStorage.getItem('etsi.best') ?? '{}') as Record<string, Best>
  } catch {
    return {}
  }
}

let toastTimer = 0

export const useGame = create<GameState>()((set, get) => ({
  mode: 'sandbox',
  challengeId: null,
  best: read(),
  toast: null,
  setMode: (mode) => set({ mode, ...(mode !== 'challenges' ? { challengeId: null } : {}) }),
  setChallenge: (challengeId) => set({ challengeId }),
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
