import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { setMode } from '../../game/gameActions'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import './Tutorial.css'

const DONE_KEY = 'etsi.tutorial.done'

interface Step {
  title: string
  body: string
  /** Élément mis en évidence. */
  target?: string
  /** Préparation de l'écran au début de l'étape. */
  prepare?: () => void
  /** L'étape est franchie quand le joueur a fait l'action. */
  done?: () => boolean
}

const narrow = () => matchMedia('(max-width: 1200px)').matches
const panelNarrow = () => matchMedia('(max-width: 960px)').matches

const STEPS: Step[] = [
  {
    title: 'Voici la France de 2025',
    body: 'Lancez le temps pour voir le futur prévu par l’Insee, sans aucun événement.',
    target: '.timeline__play',
    prepare: () => useApp.setState({ year: 2025, playing: false, selection: { level: 'france' } }),
    done: () => useApp.getState().year >= 2035,
  },
  {
    title: 'Et si… le télétravail se généralisait ?',
    body: 'Glissez la carte « Télétravail généralisé » sur la carte de France, ou cliquez sur « Placer » puis choisissez une zone.',
    target: '.ev-card--societe',
    prepare: () => {
      useApp.setState({ playing: false, year: 2025, libraryOpen: narrow() })
      setMode('sandbox')
      useApp.setState({ libraryOpen: narrow() })
      document.querySelector('.ev-card--societe')?.scrollIntoView({ block: 'center' })
    },
    done: () => useScenario.getState().scenario.events.some((e) => e.type === 'teletravail'),
  },
  {
    title: 'Bleu : plus d’habitants que prévu. Orange : moins.',
    body: 'Avancez jusqu’en 2050 avec le curseur de la frise (ou les flèches du clavier).',
    target: '.timeline__track-wrap',
    prepare: () => useApp.setState({ selectedEvent: null, placing: null }),
    done: () => useApp.getState().year >= 2050,
  },
  {
    title: 'D’où vient l’écart ?',
    body: 'La Bretagne gagne des habitants. Cliquez sur l’écart en habitants pour voir d’où il vient.',
    target: '.chip--btn',
    prepare: () => useApp.setState({ playing: false, selection: { level: 'region', code: '53' }, panelOpen: panelNarrow() }),
    done: () => useApp.getState().why !== null,
  },
  {
    title: 'À vous de jouer !',
    body: 'Ajoutez d’autres événements, relevez un défi ou testez le mode Devine. Ctrl+Z annule tout.',
  },
]

interface TutoState {
  step: number | null
  start: () => void
  stop: () => void
  go: (i: number) => void
}

export const useTutorial = create<TutoState>()((set) => ({
  step: null,
  start: () => set({ step: 0 }),
  stop: () => {
    try {
      localStorage.setItem(DONE_KEY, '1')
    } catch {
      /* stockage indisponible */
    }
    set({ step: null })
  },
  go: (i) => set({ step: i }),
}))

/** Lance le tutoriel à la première visite (sauf ?tutoriel=0). */
export function maybeStartTutorial() {
  try {
    if (new URLSearchParams(location.search).get('tutoriel') === '0') return
    if (localStorage.getItem(DONE_KEY)) return
  } catch {
    return
  }
  useTutorial.getState().start()
}

/** Tutoriel interactif : le joueur fait lui-même chaque action ; on peut revenir ou passer à tout moment. */
export function Tutorial() {
  const step = useTutorial((s) => s.step)
  const go = useTutorial((s) => s.go)
  const stop = useTutorial((s) => s.stop)
  const cardRef = useRef<HTMLDivElement>(null)
  const s = step !== null ? STEPS[step] : null

  // préparation, mise en évidence de la cible et détection de l'action attendue
  useEffect(() => {
    if (step === null) return
    const st = STEPS[step]
    st.prepare?.()
    let el: Element | null = null
    const mark = () => {
      el?.classList.remove('coach-target')
      el = st.target ? document.querySelector(st.target) : null
      el?.classList.add('coach-target')
    }
    const t = window.setTimeout(mark, 60)
    // une seule transition par étape (la mise en pause relance les abonnements de façon synchrone)
    let fired = false
    const check = () => {
      if (fired || !st.done?.()) return
      fired = true
      go(step + 1)
      if (step === 0) useApp.setState({ playing: false })
    }
    const unA = useApp.subscribe(check)
    const unS = useScenario.subscribe(check)
    return () => {
      window.clearTimeout(t)
      unA()
      unS()
      el?.classList.remove('coach-target')
    }
  }, [step, go])

  useEffect(() => {
    if (step === STEPS.length - 1) cardRef.current?.querySelector<HTMLButtonElement>('.btn-primary')?.focus()
  }, [step])

  if (!s || step === null) return null
  const last = step === STEPS.length - 1
  return (
    <div ref={cardRef} className="coach" role="dialog" aria-modal="false" aria-labelledby="coach-title" aria-describedby="coach-body">
      <p className="coach__step">
        Prise en main · étape {Math.min(step + 1, STEPS.length - 1)} sur {STEPS.length - 1}
      </p>
      <h2 id="coach-title" className="coach__title">
        {s.title}
      </h2>
      <p id="coach-body" className="coach__body" aria-live="polite">
        {s.body}
      </p>
      <div className="coach__foot">
        {step > 0 && !last && (
          <button type="button" className="btn-ghost" onClick={() => go(step - 1)}>
            Retour
          </button>
        )}
        {last ? (
          <button type="button" className="btn-primary" onClick={stop}>
            Terminer
          </button>
        ) : (
          <button type="button" className="btn-ghost coach__skip" onClick={stop}>
            Passer le tutoriel
          </button>
        )}
      </div>
    </div>
  )
}
