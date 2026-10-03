import { useEffect, useMemo, useRef } from 'react'
import { useApp, type ThemePref } from '../../state/appStore'
import { Icon } from '../common/Icon'
import { prepareGeometry } from '../map/geo'
import { MapView } from '../map/MapView'
import { ZonePanel } from '../panel/ZonePanel'
import { useResolvedTheme } from '../theme'
import { Timeline } from '../timeline/Timeline'
import './AppShell.css'

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<ThemePref, string> = { system: 'automatique', light: 'clair', dark: 'sombre' }

export function ThemeButton() {
  const pref = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(THEME_NEXT[pref])}
      aria-label={`Thème ${THEME_LABEL[pref]}. Passer au thème ${THEME_LABEL[THEME_NEXT[pref]]}`}
      title={`Thème : ${THEME_LABEL[pref]}`}
    >
      <Icon name={pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'auto'} />
    </button>
  )
}

export function AppShell() {
  const topo = useApp((s) => s.topo)!
  const panelOpen = useApp((s) => s.panelOpen)
  const setPanelOpen = useApp((s) => s.setPanelOpen)
  const theme = useResolvedTheme()
  const geom = useMemo(() => prepareGeometry(topo), [topo])
  const closeRef = useRef<HTMLButtonElement>(null)

  // tiroir : focus à l'ouverture, Échap pour fermer, focus rendu au bouton
  useEffect(() => {
    if (!panelOpen) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [panelOpen, setPanelOpen])

  return (
    <div className="shell">
      <a className="skip-link" href="#carte">
        Aller à la carte
      </a>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="Et si… ? Accueil">
          <span className="brand__mark">Et si… ?</span>
          <span className="brand__sub">la France de 2025 à 2100</span>
        </a>
        <nav className="topbar__nav" aria-label="Pages">
          <a href="#/comment-ca-marche" className="topbar__link" aria-label="Comment ça marche">
            <Icon name="book" size={18} />
            <span>Comment ça marche</span>
          </a>
          <ThemeButton />
        </nav>
      </header>

      <main className="stage" id="carte" tabIndex={-1}>
        <div className="stage__map">
          <MapView geom={geom} theme={theme} />
        </div>
        <aside id="analyse" className={`stage__panel ${panelOpen ? 'is-open' : ''}`} aria-label="Analyse de la zone">
          <button ref={closeRef} type="button" className="icon-btn stage__close" onClick={() => setPanelOpen(false)} aria-label="Fermer l’analyse">
            <Icon name="close" />
          </button>
          <ZonePanel />
        </aside>
        {panelOpen && <div className="stage__scrim" onClick={() => setPanelOpen(false)} aria-hidden="true" />}
      </main>

      <Timeline />
    </div>
  )
}
