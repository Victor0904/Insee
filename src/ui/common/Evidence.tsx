import type { EventDef, ScenarioEvent } from '../../engine/types'
import { Term } from './Term'
import './Evidence.css'

const LABEL = {
  insee: { short: 'Variante Insee', long: 'Reproduit une variante officielle des projections de l’Insee (2026). L’écart est vérifié par un test automatique.' },
  historique: { short: 'Calé sur l’histoire', long: 'À intensité forte, l’ampleur correspond à un épisode réel (cité dans la fiche). Vérifié par un test automatique.' },
  hypothese: { short: 'Hypothèse de jeu', long: 'Effet plausible mais non calé sur une donnée : il sert à explorer un mécanisme, pas à prévoir.' },
  horsCadre: {
    short: 'Hors cadre Insee',
    long: 'Variante Insee réglée autrement que dans la publication officielle (intensité ou zone) : ce n’est plus un scénario officiel, mais une hypothèse de jeu.',
  },
} as const

/** Une variante Insee n'est officielle qu'à intensité forte, sur toute la France. */
export const isOfficialSetting = (ev: Pick<ScenarioEvent, 'intensity' | 'zone'>) => Math.abs(ev.intensity - 1) < 1e-9 && ev.zone.level === 'france'

/** Niveau de preuve d'un événement : texte + forme (jamais la couleur seule). */
export function EvidenceBadge({ def, ev: placed }: { def: EventDef; ev?: Pick<ScenarioEvent, 'intensity' | 'zone'> }) {
  const level = def.evidence ?? 'hypothese'
  const ev = level === 'insee' && placed && !isOfficialSetting(placed) ? 'hypothese' : level
  const l = level === 'insee' && ev === 'hypothese' ? LABEL.horsCadre : LABEL[ev]
  return (
    <Term technical={l.long}>
      <span className={`evidence evidence--${ev}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          {ev === 'insee' && <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" />}
          {ev === 'historique' && <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />}
          {ev === 'hypothese' && <path d="M4.5 4.5a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.7.6-.7 1.1M6 9.4v.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
        </svg>
        {l.short}
      </span>
    </Term>
  )
}
