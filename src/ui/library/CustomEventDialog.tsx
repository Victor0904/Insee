import { useEffect, useId, useRef, useState } from 'react'
import type { AgeRange, Effect, EventDef, Zone } from '../../engine/types'
import { zoneKey } from '../../engine/zones'
import { NAMED_ZONES } from '../../events/zones'
import { fmtInt, fmtSigned } from '../../lib/format'
import { useApp } from '../../state/appStore'
import { newUid, useScenario } from '../../state/scenarioStore'
import './CustomEventDialog.css'

const WHO: { id: string; label: string; ages: AgeRange }[] = [
  { id: 'tous', label: 'Tout le monde', ages: [0, 100] },
  { id: 'enfants', label: 'Les enfants (0-17 ans)', ages: [0, 17] },
  { id: 'jeunes', label: 'Les jeunes adultes (18-34 ans)', ages: [18, 34] },
  { id: 'adultes', label: 'Les adultes (35-64 ans)', ages: [35, 64] },
  { id: 'seniors', label: 'Les seniors (65 ans et plus)', ages: [65, 100] },
]

interface Form {
  name: string
  who: string
  births: number // %
  deaths: number // %
  moveTo: string // zoneKey ou ''
  moveRate: number // % par an
  abroad: number // personnes par an
  duration: number
}

const INITIAL: Form = { name: 'Mon événement', who: 'tous', births: 0, deaths: 0, moveTo: '', moveRate: 0.5, abroad: 0, duration: 10 }

/** Construit la définition d'un événement personnalisé à partir des curseurs. */
export function buildCustomEvent(f: Form, destinations: { key: string; zone: Zone; label: string }[]): EventDef {
  const who = WHO.find((w) => w.id === f.who) ?? WHO[0]
  const effects: Effect[] = []
  if (f.births) effects.push({ kind: 'fertility', mult: 1 + f.births / 100 })
  if (f.deaths) effects.push({ kind: 'mortality', mult: 1 + f.deaths / 100, ages: who.ages })
  const dest = destinations.find((d) => d.key === f.moveTo)
  if (dest && f.moveRate > 0) effects.push({ kind: 'move', to: dest.zone, rate: f.moveRate / 100, ages: who.ages })
  if (f.abroad) effects.push({ kind: 'external', perYear: f.abroad, ages: who.ages })
  const parts = [
    f.births ? `${fmtSigned(f.births)} % de naissances` : '',
    f.deaths ? `${fmtSigned(f.deaths)} % de décès (${who.label.toLowerCase()})` : '',
    dest && f.moveRate > 0 ? `${String(f.moveRate).replace('.', ',')} % des habitants partent chaque année vers : ${dest.label}` : '',
    f.abroad ? `${fmtSigned(f.abroad)} arrivées de l’étranger par an` : '',
  ].filter(Boolean)
  return {
    id: `perso-${newUid()}`,
    name: f.name.trim() || 'Mon événement',
    family: 'perso',
    icon: 'custom',
    summary: parts.length ? parts.join(' ; ') + '.' : 'Aucun effet pour l’instant.',
    defaults: { duration: f.duration, intensity: 1, zone: { level: 'france', codes: [] } },
    profile: 'step',
    effects,
    hypothesis: 'Événement créé par le joueur : les valeurs sont celles des curseurs (intensité « forte » = 100 %).',
    source: 'Hypothèse du joueur.',
    estimated: true,
  }
}

export function CustomEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const data = useApp((s) => s.data)!
  const [f, setF] = useState<Form>(INITIAL)
  const id = useId()
  const destinations = [
    ...NAMED_ZONES.filter((z) => z.zone.level !== 'france').map((z) => ({ key: zoneKey(z.zone), zone: z.zone, label: z.label })),
    ...data.regions.map((r) => ({ key: zoneKey({ level: 'region', codes: [r.code] }), zone: { level: 'region' as const, codes: [r.code] }, label: r.name })),
  ].filter((d, i, all) => all.findIndex((x) => x.key === d.key) === i)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const def = buildCustomEvent(f, destinations)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  return (
    <dialog ref={ref} className="custom" aria-labelledby={`${id}-t`} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!def.effects.length) return
          useScenario.getState().addCustom(def)
          onClose()
          setF(INITIAL)
          useApp.getState().setPlacing({ type: def.id })
        }}
      >
        <h2 id={`${id}-t`} className="custom__title">
          Créer mon événement
        </h2>
        <p className="custom__lede">Réglez ce qui change ; vous choisirez ensuite où et quand.</p>

        <label className="field">
          <span className="field__label">Nom</span>
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={40} required />
        </label>
        <label className="field">
          <span className="field__label">Qui est concerné ?</span>
          <select className="select" value={f.who} onChange={(e) => set('who', e.target.value)}>
            {WHO.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">
            Naissances : <strong>{f.births === 0 ? 'comme d’habitude' : `${fmtSigned(f.births)} %`}</strong>
          </span>
          <input type="range" min={-50} max={50} step={5} value={f.births} onChange={(e) => set('births', Number(e.target.value))} aria-valuetext={`${f.births} %`} />
          <span className="field__scale">
            <span>moins de naissances</span>
            <span>plus de naissances</span>
          </span>
        </label>
        <label className="field">
          <span className="field__label">
            Décès : <strong>{f.deaths === 0 ? 'comme d’habitude' : `${fmtSigned(f.deaths)} %`}</strong>
          </span>
          <input type="range" min={-50} max={50} step={5} value={f.deaths} onChange={(e) => set('deaths', Number(e.target.value))} aria-valuetext={`${f.deaths} %`} />
          <span className="field__scale">
            <span>moins de décès</span>
            <span>plus de décès</span>
          </span>
        </label>
        <div className="custom__row">
          <label className="field">
            <span className="field__label">Des gens partent de la zone choisie vers…</span>
            <select className="select" value={f.moveTo} onChange={(e) => set('moveTo', e.target.value)}>
              <option value="">Personne ne part</option>
              {destinations.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {f.moveTo && (
            <label className="field">
              <span className="field__label">
                Combien ? <strong>{String(f.moveRate).replace('.', ',')} % par an</strong>
              </span>
              <input type="range" min={0.1} max={3} step={0.1} value={f.moveRate} onChange={(e) => set('moveRate', Number(e.target.value))} />
            </label>
          )}
        </div>
        <label className="field">
          <span className="field__label">
            Arrivées de l’étranger en plus : <strong>{f.abroad === 0 ? 'aucune' : `${fmtSigned(f.abroad)} par an`}</strong>
          </span>
          <input type="range" min={-100000} max={200000} step={10000} value={f.abroad} onChange={(e) => set('abroad', Number(e.target.value))} aria-valuetext={`${fmtInt(f.abroad)} par an`} />
        </label>
        <label className="field">
          <span className="field__label">
            Durée : <strong>{f.duration} ans</strong>
          </span>
          <input type="range" min={1} max={40} value={f.duration} onChange={(e) => set('duration', Number(e.target.value))} />
        </label>

        <p className="custom__preview" aria-live="polite">
          <strong>En résumé :</strong> {def.summary}
        </p>
        <div className="custom__foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={!def.effects.length}>
            Créer et placer
          </button>
        </div>
      </form>
    </dialog>
  )
}
