import { useId, type ReactNode } from 'react'
import './Term.css'

/**
 * Libellé grand public ; le terme technique s'affiche au survol et au focus clavier.
 * Ex. <Term technical="Rapport de dépendance">Seniors pour 100 actifs</Term>
 */
export function Term({ children, technical }: { children: ReactNode; technical: string }) {
  const id = useId()
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="term__tip">
        {technical}
      </span>
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
