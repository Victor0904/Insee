import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { redo, undo } from '../../state/actions'
import { useScenario } from '../../state/scenarioStore'
import { Icon } from '../common/Icon'
import './HistoryMenu.css'

const UNDO = 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'
const REDO = 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3'

function Glyph({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/** Liste des actions passées ; un clic revient à l'étape choisie. Partagée entre l'en-tête et le menu mobile. */
export function HistoryList({ onDone }: { onDone?: () => void }) {
  const past = useStore(useScenario.temporal, (s) => s.pastStates)
  const future = useStore(useScenario.temporal, (s) => s.futureStates)
  const current = useScenario((s) => s.label)
  // pastStates[i].label = état AVANT l'action ; l'action i est donc décrite par l'état suivant
  const labels = [...past.map((p) => p.label ?? ''), current]
  const steps = labels.slice(1)
  return (
    <>
      {steps.length === 0 ? (
        <p className="history__empty">Aucune action pour l’instant.</p>
      ) : (
        <ol className="history__list" reversed>
          {[...steps].reverse().map((label, i) => (
            <li key={`${label}-${i}`}>
              {i === 0 ? (
                <span className="history__current">
                  {label} <span className="history__tag">actuel</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="history__step"
                  onClick={() => {
                    useScenario.temporal.getState().undo(i)
                    onDone?.()
                  }}
                >
                  {label}
                  <span className="sr-only"> : revenir à cette étape</span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {future.length > 0 && <p className="history__empty">{future.length} action(s) annulée(s) : Ctrl+Y pour rétablir.</p>}
    </>
  )
}

/** Annuler / rétablir (Ctrl+Z / Ctrl+Y) et liste des actions passées. */
export function HistoryMenu() {
  const past = useStore(useScenario.temporal, (s) => s.pastStates)
  const future = useStore(useScenario.temporal, (s) => s.futureStates)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="history" ref={box}>
      <button type="button" className="icon-btn" onClick={undo} disabled={!past.length} aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)">
        <Glyph d={UNDO} />
      </button>
      <button type="button" className="icon-btn" onClick={redo} disabled={!future.length} aria-label="Rétablir (Ctrl+Y)" title="Rétablir (Ctrl+Y)">
        <Glyph d={REDO} />
      </button>
      <button type="button" className="topbar__link" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} aria-label="Historique des actions">
        <Icon name="restart" size={18} />
        <span>Historique</span>
      </button>
      {open && (
        <div className="history__panel" role="region" aria-label="Historique des actions">
          <HistoryList onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
