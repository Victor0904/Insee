import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EXAMPLES, parseEvent, toEventDef, type ParseResult } from '../../lab/parse'
import { placeEvent } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { newUid, useScenario } from '../../state/scenarioStore'
import '../library/CustomEventDialog.css'

const EVIDENCE_LABEL = { insee: 'Variante Insee', historique: 'Calé sur l’histoire', hypothese: 'Hypothèse de jeu' } as const
import './TextEventDialog.css'

/** Pose l'événement décrit : l'événement de la bibliothèque s'il correspond exactement, sinon un événement personnalisé. */
function addFromText(r: ParseResult, text: string) {
  if (r.libraryMatch) {
    const uid = placeEvent(r.libraryMatch, { start: r.start, zone: r.zone })
    if (uid) useScenario.getState().updateEvent(uid, { duration: r.duration }, `Durée : ${r.duration} ans`)
    return
  }
  const def = toEventDef(r, `texte-${newUid()}`, text)
  useScenario.getState().addCustom(def)
  placeEvent(def.id, { start: r.start, zone: r.zone })
}

export function TextEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const data = useApp((s) => s.data)!
  const year = useApp((s) => s.year)
  const [text, setText] = useState('')
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const r = useMemo(
    () =>
      text.trim().length < 4
        ? null
        : parseEvent(text, { departments: data.departments, regions: data.regions, startYear: data.startYear, endYear: data.endYear, defaultStart: year }),
    [text, data, year],
  )
  const end = r ? r.start + r.duration : 0

  return (
    <dialog ref={ref} className="custom textev" aria-labelledby={`${id}-t`} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!r?.effects.length) return
          addFromText(r, text)
          setText('')
          onClose()
        }}
      >
        <p className="textev__badge">Mode test</p>
        <h2 id={`${id}-t`} className="custom__title">
          Décrire un événement
        </h2>
        <p className="custom__lede">
          Écrivez ce qui se passe, en une phrase. Le jeu la traduit en effets sur les naissances, les décès et les migrations, puis vous montre ce qu’il a compris
          avant de l’ajouter. La traduction se fait sur l’appareil, avec des règles, sans IA.
        </p>

        <label className="field">
          <span className="field__label">Votre événement</span>
          <textarea
            id={`${id}-text`}
            className="input textev__input"
            rows={3}
            maxLength={300}
            value={text}
            placeholder="Ex. : les jeunes quittent Paris pour la Bretagne à partir de 2030"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {!text.trim() && (
          <div className="textev__examples" role="group" aria-label="Exemples à essayer">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="textev__chip" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="textev__result" aria-live="polite">
          {!r && <p className="textev__empty">Le résultat s’affiche ici pendant que vous écrivez. Effacez le texte pour revoir les exemples.</p>}
          {r && (
            <>
              {r.understood.length > 0 && (
                <section>
                  <h3 className="textev__h">Compris</h3>
                  <ul className="textev__list">
                    {r.understood.map((u, i) => (
                      <li key={i} className="textev__ok">
                        <span>{u.explanation}</span>
                        <q>{u.text}</q>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {r.ignored.length > 0 && (
                <section>
                  <h3 className="textev__h">Pas pris en compte</h3>
                  <ul className="textev__list">
                    {r.ignored.map((u, i) => (
                      <li key={i} className="textev__no">
                        <span>{u.reason}</span>
                        <q>{u.text}</q>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {r.effects.length > 0 && (
                <dl className="textev__facts">
                  <div>
                    <dt>Où</dt>
                    <dd>{r.zoneLabel}</dd>
                  </div>
                  <div>
                    <dt>Quand</dt>
                    <dd>
                      {r.start} → {end >= data.endYear ? `${data.endYear}` : end}
                      {!r.startGiven || !r.durationGiven ? <span className="textev__muted"> (modifiable ensuite)</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Niveau de preuve</dt>
                    <dd>{EVIDENCE_LABEL[r.evidence]}</dd>
                  </div>
                </dl>
              )}
              {r.notes.map((n, i) => (
                <p key={i} className="textev__note">
                  {n}
                </p>
              ))}
              {r.effects.length === 0 && r.understood.length === 0 && (
                <p className="textev__empty">
                  Rien de simulable pour l’instant. Parlez de naissances, de décès, d’immigration, de départs à l’étranger ou de déménagements entre régions.
                </p>
              )}
            </>
          )}
        </div>

        <div className="custom__foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={!r?.effects.length}>
            Ajouter au scénario
          </button>
        </div>
      </form>
    </dialog>
  )
}
