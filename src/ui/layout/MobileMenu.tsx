import { useEffect, useRef, useState } from 'react'
import { redo, undo } from '../../state/actions'
import { useApp, type ThemePref } from '../../state/appStore'
import { Icon } from '../common/Icon'
import { useTutorial } from '../tutorial/Tutorial'
import { HistoryList } from './HistoryMenu'

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<ThemePref, string> = { system: 'automatique', light: 'clair', dark: 'sombre' }

/** Outils de l'en-tête regroupés dans un menu sur petit écran. */
export function MobileMenu({ onScenario }: { onScenario: () => void }) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)

  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLButtonElement>('.menu__item')?.focus()
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

  const act = (f: () => void) => () => {
    f()
    setOpen(false)
  }

  return (
    <div className="menu" ref={box}>
      <button type="button" className="icon-btn" aria-expanded={open} aria-controls="menu-outils" aria-label="Menu des outils" onClick={() => setOpen(!open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div id="menu-outils" className="menu__panel" role="group" aria-label="Outils">
          <button type="button" className="menu__item" onClick={act(onScenario)}>
            <Icon name="save" size={18} /> Mon scénario : enregistrer, partager
          </button>
          <button type="button" className="menu__item" onClick={act(undo)}>
            Annuler (Ctrl+Z)
          </button>
          <button type="button" className="menu__item" onClick={act(redo)}>
            Rétablir (Ctrl+Y)
          </button>
          <button type="button" className="menu__item" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
            <Icon name="restart" size={18} /> Historique des actions
          </button>
          {showHistory && (
            <div className="menu__history" role="region" aria-label="Historique des actions">
              <HistoryList onDone={() => setOpen(false)} />
            </div>
          )}
          <button type="button" className="menu__item" onClick={act(() => useTutorial.getState().start())}>
            <Icon name="info" size={18} /> Revoir la prise en main
          </button>
          <a href="#/comment-ca-marche" className="menu__item" onClick={() => setOpen(false)}>
            <Icon name="book" size={18} /> Comment ça marche
          </a>
          <button type="button" className="menu__item" onClick={() => setTheme(THEME_NEXT[theme])}>
            Thème : {THEME_LABEL[theme]} (changer)
          </button>
        </div>
      )}
    </div>
  )
}
