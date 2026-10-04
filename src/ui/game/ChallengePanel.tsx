import { useEffect, useMemo, useRef } from 'react'
import { CHALLENGES, challengeById, evaluateChallenge, type ChallengeStatus } from '../../game/challenges'
import { leaveChallenge, startChallenge } from '../../game/gameActions'
import { eventDef } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useGame } from '../../state/gameStore'
import { useScenario } from '../../state/scenarioStore'
import { LibraryPanel } from '../library/LibraryPanel'
import './GamePanels.css'

function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="stars" aria-label={label ?? `${n} étoile${n > 1 ? 's' : ''} sur 3`} role="img">
      {[1, 2, 3].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={i <= n ? 'star star--on' : 'star'}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
        </svg>
      ))}
    </span>
  )
}

/** Évaluation en direct du défi actif (partagée entre le panneau et la pastille de la carte). */
export function useChallengeStatus(): ChallengeStatus | null {
  const id = useGame((s) => s.challengeId)
  const data = useApp((s) => s.data)
  const baseline = useApp((s) => s.baseline)
  const result = useApp((s) => s.result)
  const scenario = useScenario((s) => s.scenario)
  return useMemo(() => {
    const ch = id ? challengeById(id) : undefined
    if (!ch || !data || !baseline || !result) return null
    // tant que le calcul n'a pas rattrapé le scénario, on évalue la référence (prudence)
    const res = scenario.events.length === 0 ? baseline : result
    return evaluateChallenge(ch, { data, baseline, result: res, scenario })
  }, [id, data, baseline, result, scenario])
}

export function ChallengePanel({ onCreate }: { onCreate: () => void }) {
  const id = useGame((s) => s.challengeId)
  const best = useGame((s) => s.best)
  const record = useGame((s) => s.recordBest)
  const say = useGame((s) => s.say)
  const computing = useApp((s) => s.computing)
  const setYear = useApp((s) => s.setYear)
  const status = useChallengeStatus()
  const ch = id ? challengeById(id) : undefined
  const wasSuccess = useRef(false)

  useEffect(() => {
    if (!ch || !status || computing) return
    if (status.success && !wasSuccess.current) {
      record(ch.id, { score: status.score, stars: status.stars })
      say(`Défi réussi : ${status.score} points, ${status.stars} étoile${status.stars > 1 ? 's' : ''} sur 3.`)
    }
    wasSuccess.current = status.success
  }, [ch, status, computing, record, say])

  if (!ch)
    return (
      <section className="game" aria-labelledby="challenges-title">
        <h2 id="challenges-title" className="game__title">
          Défis
        </h2>
        <p className="game__help">Un objectif, des contraintes, un score. Choisissez une mission.</p>
        <ul className="game__list">
          {CHALLENGES.map((c) => (
            <li key={c.id} className="game-card">
              <h3 className="game-card__title">{c.title}</h3>
              <p className="game-card__text">{c.goal}</p>
              <p className="game-card__meta">
                {c.maxEvents} événements au plus
                {c.forbidden?.length ? ` · interdit : ${c.forbidden.map((f) => eventDef(f)?.name).join(', ')}` : ''}
              </p>
              <div className="game-card__foot">
                {best[c.id] ? <Stars n={best[c.id].stars} label={`Meilleur résultat : ${best[c.id].score} points, ${best[c.id].stars} étoiles sur 3`} /> : <span className="game-card__new">jamais tenté</span>}
                <button type="button" className="btn-secondary" onClick={() => startChallenge(c.id)} aria-label={`Relever le défi : ${c.title}`}>
                  Relever
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )

  const chk = status?.check
  const progress = chk
    ? chk.dir === 'atLeast'
      ? Math.max(0, Math.min(1, chk.value / chk.target))
      : Math.max(0, Math.min(1, chk.target / Math.max(chk.value, 1e-9)))
    : 0

  return (
    <section className="game game--active" aria-labelledby="challenge-title">
      <button type="button" className="btn-ghost game__back" onClick={leaveChallenge}>
        ← Tous les défis
      </button>
      <div className="mission">
        <p className="mission__kicker">Défi</p>
        <h2 id="challenge-title" className="game__title">
          {ch.title}
        </h2>
        <p className="mission__goal">{ch.goal}</p>
        {status && chk && (
          <div className={`mission__status ${status.success ? 'is-success' : ''}`} role="status" aria-live="polite">
            <p className="mission__measure">
              {ch.measure} : <strong>{chk.format(chk.value)}</strong> — objectif {chk.dir === 'atLeast' ? 'au moins' : 'au plus'}{' '}
              {chk.format(chk.target)}
            </p>
            <div className="meter" aria-hidden="true">
              <span className="meter__fill" style={{ width: `${100 * progress}%` }} />
            </div>
            <ul className="mission__rules">
              <li className={status.eventsUsed <= ch.maxEvents ? 'ok' : 'ko'}>
                Événements : {status.eventsUsed} sur {ch.maxEvents} autorisés
              </li>
              {chk.extraLabel && <li className={chk.extraOk ? 'ok' : 'ko'}>{chk.extraLabel}</li>}
              {status.forbiddenUsed.length > 0 && <li className="ko">Événement interdit utilisé : {status.forbiddenUsed.map((f) => eventDef(f)?.name).join(', ')}</li>}
              {status.requiredMissing.length > 0 && <li className="ko">Événement imposé retiré : {status.requiredMissing.map((f) => eventDef(f)?.name).join(', ')}</li>}
            </ul>
            {status.success ? (
              <p className="mission__win">
                <strong>Réussi !</strong> {status.score} points <Stars n={status.stars} />
                <span className="mission__how">Moins d’événements et plus de marge rapportent plus de points.</span>
              </p>
            ) : (
              <p className="mission__hint">Indice : {ch.hint}</p>
            )}
            <button type="button" className="btn-ghost" onClick={() => setYear(ch.year)}>
              Voir {ch.year}
            </button>
          </div>
        )}
      </div>
      <LibraryPanel onCreate={onCreate} hidden={ch.forbidden} compact />
    </section>
  )
}

export { Stars }
