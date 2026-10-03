import { useEffect, useState } from 'react'
import { fetchSources, type SourceEntry } from '../../data/load'
import { useApp } from '../../state/appStore'
import { Validation } from './Validation'
import './MethodPage.css'

/** Page « Comment ça marche » : modèle, sources, limites et validation. Complétée au jalon 6. */
export function MethodPage() {
  const data = useApp((s) => s.data)
  const baseline = useApp((s) => s.baseline)
  const reference = useApp((s) => s.reference)
  const horizon = useApp((s) => s.officialHorizon)
  const [sources, setSources] = useState<SourceEntry[]>([])
  useEffect(() => {
    fetchSources().then(setSources, () => setSources([]))
  }, [])

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__kicker">Comment ça marche</p>
        <h1 className="masthead__title">Le modèle, ses sources et ses limites</h1>
        <p className="masthead__lede">
          Chaque année, dans chaque département, chacun vieillit d’un an ; certains décèdent, des bébés naissent, des
          habitants déménagent ou arrivent de l’étranger. C’est la méthode des composantes, celle des démographes.
          Sans événement, le jeu suit les projections officielles de l’Insee : voici comment on le vérifie.
        </p>
        <p>
          <a href="#/" className="link-back">
            ← Retour à la carte
          </a>
        </p>
      </header>
      {data && baseline && reference && (
        <Validation data={data} baseline={baseline} reference={reference} sources={sources} officialHorizon={horizon} />
      )}
    </div>
  )
}
