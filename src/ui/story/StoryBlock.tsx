import { useMemo } from 'react'
import { catalogFor } from '../../events/catalog'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { narrate } from '../../story/narrative'
import './StoryBlock.css'

/** « Ce qui change » : le récit automatique des 3 changements les plus marquants. */
export function StoryBlock() {
  const data = useApp((s) => s.data)!
  const baseline = useApp((s) => s.baseline)!
  const result = useApp((s) => s.result)!
  const selection = useApp((s) => s.selection)
  const year = useApp((s) => s.year)
  const custom = useScenario((s) => s.scenario.custom)
  const hasEvents = useScenario((s) => s.scenario.events.length > 0)
  const lines = useMemo(
    () => narrate(data, baseline, result, catalogFor({ custom }), selection, year - data.startYear),
    [data, baseline, result, custom, selection, year],
  )

  return (
    <section className="story" aria-labelledby="story-title" aria-live="polite">
      <h3 id="story-title" className="story__title">
        Ce qui change
      </h3>
      {!hasEvents ? (
        <p className="story__empty">
          Pour l’instant, ce futur suit la référence : les projections de l’Insee. Glissez un événement sur la carte pour
          voir ce qui change.
        </p>
      ) : year === data.startYear ? (
        <p className="story__empty">Faites avancer le temps pour voir les effets.</p>
      ) : (
        <ol className="story__list">
          {lines.map((l) => (
            <li key={l.text} className={`story__line story__line--${l.tone}`}>
              <span className="story__mark" aria-hidden="true">
                {l.tone === 'gain' ? '+' : l.tone === 'loss' ? '−' : '='}
              </span>
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
