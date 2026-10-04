import { useState } from 'react'
import { PRESETS } from '../../game/presets'
import { loadPreset, setMode } from '../../game/gameActions'
import './GamePanels.css'

/** Scénarios célèbres préchargés. */
export function PresetsPanel() {
  const [active, setActive] = useState<string | null>(null)
  const p = PRESETS.find((x) => x.id === active)
  return (
    <section className="game" aria-labelledby="presets-title">
      <h2 id="presets-title" className="game__title">
        Scénarios célèbres
      </h2>
      <p className="game__help">Des futurs tout prêts à explorer. Chargez-en un, puis lancez le temps ou modifiez-le.</p>
      {p && (
        <div className="mission" role="status" aria-live="polite">
          <p className="mission__kicker">Chargé</p>
          <h3 className="game-card__title">{p.title}</h3>
          <p className="mission__goal">
            <strong>À regarder :</strong> {p.lookAt}
          </p>
          <p className="game-card__meta">{p.note}</p>
          <button type="button" className="btn-secondary" onClick={() => setMode('sandbox')}>
            Modifier ce scénario
          </button>
        </div>
      )}
      <ul className="game__list">
        {PRESETS.map((x) => (
          <li key={x.id} className={`game-card ${x.id === active ? 'is-active' : ''}`}>
            <h3 className="game-card__title">{x.title}</h3>
            <p className="game-card__text">{x.summary}</p>
            <div className="game-card__foot">
              <span className="game-card__meta">vu en {x.year}</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  loadPreset(x.id)
                  setActive(x.id)
                }}
                aria-label={`Charger : ${x.title}`}
              >
                Charger
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
