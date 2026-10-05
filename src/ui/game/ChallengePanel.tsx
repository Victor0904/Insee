import { useEffect, useMemo, useRef } from 'react'
import { CHALLENGES, challengeById, evaluateChallenge, forbiddenIn, type ChallengeStatus } from '../../game/challenges'
import { leaveChallenge, runChallenge, startChallenge } from '../../game/gameActions'
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

/** Évaluation du défi actif (partagée entre le panneau et la pastille de la carte). */
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

/**
 * Le résultat d'un défi n'est révélé qu'une fois le temps lancé jusqu'à l'année du défi, avec le
 * scénario actuel (pas de validation instantanée : il faut aller voir). Toute modification du
 * scénario masque de nouveau le résultat.
 */
export function useChallengeReveal(): boolean {
  const id = useGame((s) => s.challengeId)
  const year = useApp((s) => s.year)
  const computing = useApp((s) => s.computing)
  const scenario = useScenario((s) => s.scenario)
  const revealedFor = useGame((s) => s.revealedFor)
  const prevYear = useRef(year)
  useEffect(() => {
    const ch = id ? challengeById(id) : undefined
    const before = prevYear.current
    prevYear.current = year
    if (!ch) return
    if (before < ch.year && year >= ch.year && useGame.getState().revealedFor !== scenario) useGame.setState({ revealedFor: scenario })
  }, [id, year, scenario])
  return !!id && revealedFor === scenario && !computing
}


export function ChallengePanel({ onCreate }: { onCreate: () => void }) {
  const id = useGame((s) => s.challengeId)
  const best = useGame((s) => s.best)
  const record = useGame((s) => s.recordBest)
  const say = useGame((s) => s.say)
  const year = useApp((s) => s.year)
  const playing = useApp((s) => s.playing)
  const data = useApp((s) => s.data)
  const status = useChallengeStatus()
  const revealed = useChallengeReveal()
  const ch = id ? challengeById(id) : undefined
  const announced = useRef<ChallengeStatus | null>(null)

  useEffect(() => {
    if (!ch || !status || !revealed) return
    if (announced.current === status) return
    announced.current = status
    if (status.success) {
      record(ch.id, { score: status.score, stars: status.stars })
      say(`Défi réussi : ${status.score} points, ${status.stars} étoile${status.stars > 1 ? 's' : ''} sur 3.`)
    } else say(`Défi manqué en ${ch.year} : ajustez le scénario puis relancez le temps.`)
  }, [ch, status, revealed, record, say])

  if (!ch)
    return (
      <section className="game" aria-labelledby="challenges-title">
        <h2 id="challenges-title" className="game__title">
          Défis
        </h2>
        <p className="game__help">
          Un objectif, des garde-fous, un score. Le résultat se révèle quand on lance le temps. Variantes Insee interdites, intensité « forte » au plus.
        </p>
        <ul className="game__list">
          {CHALLENGES.map((c) => {
            const b = best[c.id]
            return (
              <li key={c.id} className="game-card">
                <h3 className="game-card__title">{c.title}</h3>
                <p className="game-card__text">{c.goal}</p>
                <p className="game-card__meta">
                  {c.maxEvents} événements au plus
                  {c.forbidden?.length ? ` · interdit : ${c.forbidden.map((f) => eventDef(f)?.name).join(', ')}` : ''}
                </p>
                <div className="game-card__foot">
                  {b ? (
                    <span className="game-card__best">
                      <Stars n={b.stars} label={`${b.stars} étoile${b.stars > 1 ? 's' : ''} sur 3`} />
                      <span>
                        Meilleur : <strong>{b.score}</strong> points
                      </span>
                    </span>
                  ) : (
                    <span className="game-card__new">jamais réussi</span>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => startChallenge(c.id)} aria-label={`Relever le défi : ${c.title}`}>
                    Relever
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    )

  const chk = status?.check
  const y0 = data?.startYear ?? 2025
  const timeProgress = Math.max(0, Math.min(1, (year - y0) / Math.max(1, ch.year - y0)))
  const progress = chk
    ? chk.dir === 'atLeast'
      ? Math.max(0, Math.min(1, chk.value / chk.target))
      : Math.max(0, Math.min(1, chk.target / Math.max(chk.value, 1e-9)))
    : 0
  const banned = forbiddenIn(ch)

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
          <div className={`mission__status ${revealed && status.success ? 'is-success' : ''}`} role="status" aria-live="polite">
            {revealed ? (
              <>
                <p className="mission__measure">
                  {ch.measure} : <strong>{chk.format(chk.value)}</strong> — objectif {chk.dir === 'atLeast' ? 'au moins' : 'au plus'} {chk.format(chk.target)}
                </p>
                <div className="meter" aria-hidden="true">
                  <span className="meter__fill" style={{ width: `${100 * progress}%` }} />
                </div>
              </>
            ) : (
              <>
                <p className="mission__measure">
                  {ch.measure} : <strong>résultat révélé en {ch.year}</strong>
                </p>
                <div className="meter meter--time" aria-hidden="true">
                  <span className="meter__fill" style={{ width: `${100 * timeProgress}%` }} />
                </div>
              </>
            )}
            <ul className="mission__rules">
              <li className={status.eventsUsed <= ch.maxEvents ? 'ok' : 'ko'}>
                Événements : {status.eventsUsed} sur {ch.maxEvents} autorisés
              </li>
              {(chk.guards ?? []).map((g) =>
                revealed ? (
                  <li key={g.label} className={g.ok ? 'ok' : 'ko'}>
                    {g.label}
                    {g.value ? ` — ${g.value}` : ''}
                  </li>
                ) : (
                  <li key={g.label} className="wait">
                    {g.label}
                  </li>
                ),
              )}
              {status.forbiddenUsed.length > 0 && <li className="ko">Événement interdit utilisé : {status.forbiddenUsed.map((f) => eventDef(f)?.name).join(', ')}</li>}
              {status.tooStrong.length > 0 && (
                <li className="ko">
                  Intensité trop forte (au plus « forte ») : {status.tooStrong.map((f) => eventDef(f)?.name).join(', ')}
                </li>
              )}
              {status.tooEarly.length > 0 && (
                <li className="ko">
                  Commence avant {ch.earliestStart} : {status.tooEarly.map((f) => eventDef(f)?.name).join(', ')}
                </li>
              )}
              {status.requiredMissing.length > 0 && <li className="ko">Événement imposé retiré : {status.requiredMissing.map((f) => eventDef(f)?.name).join(', ')}</li>}
            </ul>
            {revealed && status.success ? (
              <p className="mission__win">
                <strong>Réussi !</strong> {status.score} points <Stars n={status.stars} />
                <span className="mission__how">Moins d’événements et plus de marge rapportent plus de points.</span>
              </p>
            ) : revealed ? (
              <p className="mission__hint">Pas encore. Indice : {ch.hint}</p>
            ) : (
              <p className="mission__hint">Indice : {ch.hint}</p>
            )}
            <button type="button" className="btn-primary mission__run" onClick={runChallenge} disabled={playing}>
              {playing ? `En cours… ${year}` : revealed ? `Relancer jusqu’en ${ch.year}` : `Lancer le temps jusqu’en ${ch.year}`}
            </button>
          </div>
        )}
      </div>
      <LibraryPanel onCreate={onCreate} hidden={banned} compact />
    </section>
  )
}

export { Stars }
