import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Term.css'

const TIP_MAX = 260
const MARGIN = 8

/**
 * Libellé grand public ; le terme technique s'affiche au survol et au focus clavier.
 * Ex. <Term technical="Rapport de dépendance">Seniors pour 100 actifs</Term>
 *
 * L'infobulle visible est rendue à la racine du document, en position fixe et recadrée dans la
 * fenêtre : masquée, elle n'occupe aucune place (avant, ses 260 px débordaient du panneau de
 * gauche et créaient une barre de défilement horizontale). Le texte reste lié au libellé pour les
 * lecteurs d'écran.
 */
export function Term({ children, technical }: { children: ReactNode; technical: string }) {
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const width = Math.min(TIP_MAX, vw - 2 * MARGIN)
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN))
    const below = r.top < 90
    setPos({ left, top: below ? r.bottom + 6 : r.top - 6, below })
  }
  const hide = () => setPos(null)

  return (
    <span
      ref={ref}
      className="term"
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide()
      }}
    >
      {children}
      <span id={id} className="sr-only">
        {technical}
      </span>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            aria-hidden="true"
            className={`term__tip ${pos.below ? 'term__tip--below' : ''}`}
            style={{ left: pos.left, top: pos.top, maxWidth: `min(${TIP_MAX}px, calc(100vw - ${2 * MARGIN}px))` }}
          >
            {technical}
          </span>,
          document.body,
        )}
    </span>
  )
}

/** Mention « estimé » avec la méthode au survol. */
export function Estimated({ how }: { how: string }) {
  return (
    <Term technical={how}>
      <span className="estimated-tag">estimé</span>
    </Term>
  )
}
