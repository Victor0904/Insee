import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, type ThemePref } from '../../state/appStore'
import { installShortcuts } from '../../state/actions'
import { startRunner } from '../../state/runner'
import { useScenario } from '../../state/scenarioStore'
import { Icon } from '../common/Icon'
import { WhyDialog } from '../analysis/WhyDialog'
import { ChallengePanel } from '../game/ChallengePanel'
import { GuessPanel } from '../game/GuessPanel'
import { ModeBar } from '../game/ModeBar'
import { PresetsPanel } from '../game/PresetsPanel'
import { Toast } from '../game/Toast'
import { maybeStartTutorial, Tutorial, useTutorial } from '../tutorial/Tutorial'
import { useGame } from '../../state/gameStore'
import { DragGhost } from '../dnd/DragGhost'
import { EventInspector } from '../inspector/EventInspector'
import { CustomEventDialog } from '../library/CustomEventDialog'
import { LibraryPanel } from '../library/LibraryPanel'
import { prepareGeometry } from '../map/geo'
import { MapView } from '../map/MapView'
import { PlacementBar } from '../map/PlacementBar'
import { ZonePanel } from '../panel/ZonePanel'
import { useResolvedTheme } from '../theme'
import { Timeline } from '../timeline/Timeline'
import { HistoryMenu } from './HistoryMenu'
import { MobileMenu } from './MobileMenu'
import { ScenarioDialog } from '../scenario/ScenarioDialog'
import { decodeScenario, loadDraft, saveDraft, sharedYear } from '../../state/persistence'
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

/** Tiroir accessible : focus à l'ouverture, Échap pour fermer, focus rendu à l'élément d'origine. */
function useDrawer(open: boolean, close: () => void, focusRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    focusRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [open, close, focusRef])
}

export function AppShell() {
  const topo = useApp((s) => s.topo)!
  const panelOpen = useApp((s) => s.panelOpen)
  const setPanelOpen = useApp((s) => s.setPanelOpen)
  const libraryOpen = useApp((s) => s.libraryOpen)
  const setLibraryOpen = useApp((s) => s.setLibraryOpen)
  const computing = useApp((s) => s.computing)
  const hasEvents = useScenario((s) => s.scenario.events.length > 0)
  const placing = useApp((s) => s.placing)
  const theme = useResolvedTheme()
  const geom = useMemo(() => prepareGeometry(topo), [topo])
  const closeRef = useRef<HTMLButtonElement>(null)
  const libCloseRef = useRef<HTMLButtonElement>(null)
  const [creating, setCreating] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const mode = useGame((s) => s.mode)

  useEffect(() => {
    startRunner()
    // lien de partage : ?s=… contient le scénario compressé
    const initialSearch = location.search
    const shared = new URLSearchParams(initialSearch).get('s')
    if (shared) {
      void decodeScenario(shared).then((sc) => {
        const url = new URL(location.href)
        url.searchParams.delete('s')
        url.searchParams.delete('a')
        history.replaceState(null, '', url.toString())
        if (!sc) return useGame.getState().say('Ce lien de partage est illisible ou incomplet.')
        useScenario.getState().setScenario(sc, `Scénario partagé : ${sc.name}`)
        const app = useApp.getState()
        const d = app.data
        // l'année du lien (?a=2080) si elle est donnée, sinon 2050
        const year = (d && sharedYear(initialSearch, d.startYear, d.endYear)) ?? Math.min(2050, d?.endYear ?? 2050)
        useApp.setState({ layer: app.layerTouched ? app.layer : 'delta', year })
        useGame.getState().say(`Scénario partagé « ${sc.name} » chargé (${sc.events.length} événement(s)).`)
      })
    } else {
      // brouillon du bac à sable : la recharge de la page reprend le scénario en cours
      const draft = loadDraft()
      if (draft) {
        useScenario.getState().setScenario(draft.scenario, 'Reprise du scénario en cours')
        const app = useApp.getState()
        const d = app.data
        useApp.setState({ layer: app.layerTouched ? app.layer : 'delta', year: d ? Math.max(d.startYear, Math.min(d.endYear, draft.year)) : draft.year })
        useGame.getState().say('Scénario en cours repris. Ctrl+Z pour repartir d’une carte vierge.')
      } else maybeStartTutorial()
    }
    // enregistrement automatique du bac à sable (pas des défis ni de Devine, qui ont leur propre scénario)
    let timer = 0
    const persist = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (useGame.getState().mode !== 'sandbox') return
        saveDraft(useScenario.getState().scenario, useApp.getState().year)
      }, 400)
    }
    const unS = useScenario.subscribe((st, prev) => {
      if (st.scenario !== prev.scenario) persist()
    })
    const unA = useApp.subscribe((st, prev) => {
      if (st.year !== prev.year && !st.playing) persist()
    })
    const unInstall = installShortcuts()
    return () => {
      unS()
      unA()
      unInstall()
      window.clearTimeout(timer)
    }
  }, [])
  const closePanel = useMemo(() => () => setPanelOpen(false), [setPanelOpen])
  const closeLibrary = useMemo(() => () => setLibraryOpen(false), [setLibraryOpen])
  useDrawer(panelOpen, closePanel, closeRef)
  useDrawer(libraryOpen, closeLibrary, libCloseRef)

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
        <ModeBar />
        <nav className="topbar__nav" aria-label="Outils">
          <span className="topbar__status" role="status" aria-live="polite">
            {computing ? 'Calcul…' : ''}
          </span>
          <div className="topbar__tools">
          <button type="button" className="topbar__link" onClick={() => setScenarioOpen(true)} aria-haspopup="dialog" aria-label="Mon scénario : enregistrer, partager, exporter">
            <Icon name="save" size={18} />
            <span>Scénario</span>
          </button>
          <HistoryMenu />
          <button type="button" className="topbar__link" onClick={() => useTutorial.getState().start()} aria-label="Revoir la prise en main">
            <Icon name="info" size={18} />
            <span>Aide</span>
          </button>
          <a href="#/comment-ca-marche" className="topbar__link" aria-label="Comment ça marche">
            <Icon name="book" size={18} />
            <span>Comment ça marche</span>
          </a>
          <ThemeButton />
          </div>
          <MobileMenu onScenario={() => setScenarioOpen(true)} />
        </nav>
      </header>

      <main className="stage" id="carte" tabIndex={-1}>
        <aside
          id="bibliotheque"
          className={`stage__library ${libraryOpen ? 'is-open' : ''}`}
          aria-label={mode === 'sandbox' ? 'Bibliothèque d’événements' : mode === 'challenges' ? 'Défis' : mode === 'guess' ? 'Devine' : 'Scénarios célèbres'}
        >
          <button ref={libCloseRef} type="button" className="icon-btn stage__close" onClick={closeLibrary} aria-label="Fermer la bibliothèque">
            <Icon name="close" />
          </button>
          {mode === 'sandbox' && <LibraryPanel onCreate={() => setCreating(true)} />}
          {mode === 'challenges' && <ChallengePanel onCreate={() => setCreating(true)} />}
          {mode === 'guess' && <GuessPanel />}
          {mode === 'presets' && <PresetsPanel />}
        </aside>
        <div className="stage__map">
          <MapView geom={geom} theme={theme} />
          <PlacementBar />
          <EventInspector />
          {!hasEvents && !placing && mode === 'sandbox' && (
            <p className="stage__hint">
              <span className="stage__hint-wide">Glissez un événement sur la carte pour commencer.</span>
              <button type="button" className="btn-primary stage__hint-narrow" onClick={() => setLibraryOpen(true)} aria-controls="bibliotheque">
                Ajouter un événement
              </button>
            </p>
          )}
        </div>
        <aside id="analyse" className={`stage__panel ${panelOpen ? 'is-open' : ''}`} aria-label="Analyse de la zone">
          <button ref={closeRef} type="button" className="icon-btn stage__close" onClick={closePanel} aria-label="Fermer l’analyse">
            <Icon name="close" />
          </button>
          <ZonePanel />
        </aside>
        {(panelOpen || libraryOpen) && (
          <div
            className="stage__scrim"
            onClick={() => {
              closePanel()
              closeLibrary()
            }}
            aria-hidden="true"
          />
        )}
      </main>

      <Timeline />
      <DragGhost />
      <CustomEventDialog open={creating} onClose={() => setCreating(false)} />
      <WhyDialog />
      <Toast />
      <ScenarioDialog open={scenarioOpen} onClose={() => setScenarioOpen(false)} />
      <Tutorial />
    </div>
  )
}
