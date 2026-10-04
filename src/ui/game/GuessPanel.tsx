import { useEffect, useRef, useState } from 'react'
import { catalogFor } from '../../events/catalog'
import { EventIcon } from '../../events/icons'
import { DIRECTION_CHOICES, QUIZ, answerOf, regionChoices, roundScenario, type Choice } from '../../game/quiz'
import { narrate } from '../../story/narrative'
import { eventDef } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useGame } from '../../state/gameStore'
import { useScenario, emptyScenario } from '../../state/scenarioStore'
import { simulateDetached } from '../../state/simClient'
import { Stars } from './ChallengePanel'
import './GamePanels.css'

interface Reveal {
  correct: string
  chosen: string
  detail: string
  story: string | null
}

/** Mode « Devine » : un événement est annoncé, on prédit son effet, puis la carte révèle la réponse. */
export function GuessPanel() {
  const data = useApp((s) => s.data)!
  const baseline = useApp((s) => s.baseline)!
  const record = useGame((s) => s.recordBest)
  const best = useGame((s) => s.best.devine)
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [regionChoicesFor, setRegionChoicesFor] = useState<{ index: number; choices: Choice[] } | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const done = index >= QUIZ.length
  const round = QUIZ[Math.min(index, QUIZ.length - 1)]
  const def = eventDef(round.event.type)
  const choices: Choice[] | null =
    round.question.kind !== 'region' ? DIRECTION_CHOICES : regionChoicesFor?.index === index ? regionChoicesFor.choices : null

  // les choix de région dépendent de la bonne réponse : on la calcule dès l'affichage de la question
  useEffect(() => {
    const r = QUIZ[index]
    if (done || r.question.kind !== 'region') return
    let alive = true
    simulateDetached(roundScenario(r)).then((res) => {
      if (alive) setRegionChoicesFor({ index, choices: regionChoices(data, answerOf(data, baseline, res, r.question).id, index + 1) })
    })
    return () => {
      alive = false
    }
  }, [index, done, data, baseline])

  const answer = async (chosen: string) => {
    setBusy(true)
    const sc = roundScenario(round)
    const res = await simulateDetached(sc)
    const a = answerOf(data, baseline, res, round.question)
    const story = narrate(data, baseline, res, catalogFor(sc), { level: 'france' }, round.question.year - data.startYear)[0]?.text ?? null
    if (chosen === a.id) setScore((s) => s + 1)
    setReveal({ correct: a.id, chosen, detail: a.detail, story })
    // révélation : le scénario de la question s'affiche sur la carte, à l'année de la question
    useScenario.getState().setScenario(sc, `Devine : ${def?.name ?? round.id}`)
    useApp.setState({ year: round.question.year, layer: 'delta', selection: { level: 'france' }, selectedEvent: null, compare: 'off' })
    setBusy(false)
    window.setTimeout(() => nextRef.current?.focus(), 50)
  }

  const next = () => {
    const ni = index + 1
    setIndex(ni)
    setReveal(null)
    useScenario.getState().setScenario(emptyScenario(), 'Devine : question suivante')
    useApp.setState({ year: data.startYear })
    if (ni >= QUIZ.length) record('devine', { score: score, stars: score >= 7 ? 3 : score >= 5 ? 2 : score >= 3 ? 1 : 0 })
  }

  if (done)
    return (
      <section className="game" aria-labelledby="guess-title">
        <h2 id="guess-title" className="game__title">
          Devine : terminé
        </h2>
        <p className="mission__goal">
          Vous avez trouvé <strong>{score}</strong> bonne{score > 1 ? 's' : ''} réponse{score > 1 ? 's' : ''} sur {QUIZ.length}.
        </p>
        {best && <p className="game__help">Meilleur score : {best.score} sur {QUIZ.length}.</p>}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setIndex(0)
            setScore(0)
          }}
        >
          Rejouer
        </button>
      </section>
    )

  const label = (id: string) => (choices ?? []).find((c) => c.id === id)?.label ?? id

  return (
    <section className="game" aria-labelledby="guess-title">
      <p className="mission__kicker">
        Devine · question {index + 1} sur {QUIZ.length} · {score} point{score > 1 ? 's' : ''}
      </p>
      <h2 id="guess-title" className="game__title">
        Et si… ?
      </h2>
      <div className="guess__event">
        <EventIcon name={def?.icon ?? 'custom'} />
        <p>{round.intro}</p>
      </div>
      <fieldset className="guess__q" disabled={busy || !!reveal}>
        <legend className="guess__question">{round.question.text}</legend>
        {choices === null ? (
          <p role="status" className="game__help">
            Préparation de la question…
          </p>
        ) : (
          <div className="guess__choices">
            {choices.map((c) => {
              const state = reveal ? (c.id === reveal.correct ? 'right' : c.id === reveal.chosen ? 'wrong' : '') : ''
              return (
                <button key={c.id} type="button" className={`choice ${state ? `choice--${state}` : ''}`} onClick={() => answer(c.id)}>
                  {c.label}
                  {state === 'right' && <span className="choice__tag"> — bonne réponse</span>}
                  {state === 'wrong' && <span className="choice__tag"> — votre réponse</span>}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>
      {reveal && (
        <div className={`guess__reveal ${reveal.chosen === reveal.correct ? 'is-right' : 'is-wrong'}`} role="status" aria-live="polite">
          <p>
            <strong>{reveal.chosen === reveal.correct ? 'Bien vu !' : `Raté : c’était « ${label(reveal.correct)} ».`}</strong> {reveal.detail}
          </p>
          {reveal.story && <p className="guess__story">{reveal.story}</p>}
          <p className="game__help">La carte montre maintenant l’effet de l’événement.</p>
          <button ref={nextRef} type="button" className="btn-primary" onClick={next}>
            {index + 1 < QUIZ.length ? 'Question suivante' : 'Voir mon score'}
          </button>
        </div>
      )}
      {best && !reveal && (
        <p className="game__help">
          Meilleur score : {best.score} / {QUIZ.length} <Stars n={best.stars} />
        </p>
      )}
    </section>
  )
}
