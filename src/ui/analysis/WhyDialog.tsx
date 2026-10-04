import { useEffect, useMemo, useRef, useState } from 'react'
import { areaDeps, areaName } from '../../engine/aggregate'
import { decompose, depTotals, eventContributions, type ComponentPart } from '../../engine/decompose'
import { computeIndicators } from '../../engine/indicators'
import { EventIcon } from '../../events/icons'
import { fmtInt, fmtSigned } from '../../lib/format'
import { eventDef } from '../../state/actions'
import { useApp } from '../../state/appStore'
import { useScenario } from '../../state/scenarioStore'
import { computeContributions } from '../../state/simClient'
import { metricById, type MetricId } from './metrics'
import './WhyDialog.css'

interface Bar {
  key: string
  label: string
  value: number
  icon?: string
  note?: string
}

/** Barres horizontales signées autour d'un axe central ; valeur toujours écrite avec son signe. */
function Bars({ bars, caption }: { bars: Bar[]; caption: string }) {
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)))
  return (
    <ul className="bars" aria-label={caption}>
      {bars.map((b) => {
        const w = (50 * Math.abs(b.value)) / max
        const sign = Math.abs(b.value) < 0.5 ? 'zero' : b.value > 0 ? 'gain' : 'loss'
        return (
          <li key={b.key} className="bars__row">
            <span className="bars__label">
              {b.icon && <EventIcon name={b.icon} size={16} />}
              {b.label}
              {b.note && <span className="bars__note">{b.note}</span>}
            </span>
            <span className="bars__track" aria-hidden="true">
              <span
                className={`bars__bar bars__bar--${sign}`}
                style={sign === 'loss' ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }}
              />
            </span>
            <span className={`bars__value bars__value--${sign}`}>{sign === 'zero' ? '≈ 0' : fmtSigned(b.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** « D'où vient cet écart ? » : décomposition de l'écart à la référence et part de chaque événement. */
export function WhyDialog() {
  const why = useApp((s) => s.why) as MetricId | null
  const openWhy = useApp((s) => s.openWhy)
  const data = useApp((s) => s.data)
  const baseline = useApp((s) => s.baseline)
  const result = useApp((s) => s.result)
  const selection = useApp((s) => s.selection)
  const year = useApp((s) => s.year)
  const scenario = useScenario((s) => s.scenario)
  const ref = useRef<HTMLDialogElement>(null)
  const [contrib, setContrib] = useState<{ sc: unknown; list: { uid: string; totals: Float32Array }[] } | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (why && !d.open) d.showModal()
    if (!why && d.open) d.close()
  }, [why])

  useEffect(() => {
    if (!why || !scenario.events.length) return
    let alive = true
    computeContributions(scenario).then((list) => alive && setContrib({ sc: scenario, list }))
    return () => {
      alive = false
    }
  }, [why, scenario])

  const content = useMemo(() => {
    if (!why || !data || !baseline || !result) return null
    const deps = areaDeps(data, selection)
    const yi = year - data.startYear
    const metric = metricById(why)
    const iS = computeIndicators(data, result, deps, yi)
    const iR = computeIndicators(data, baseline, deps, yi)
    const dec = decompose(baseline, result, deps, yi)
    const parts: ComponentPart[] = dec.parts
    // à l'échelle de la France, arrivées et départs internes se compensent : on les regroupe
    const bars: Bar[] =
      selection.level === 'france'
        ? [
            ...parts.filter((p) => p.key === 'births' || p.key === 'deaths' || p.key === 'ext'),
            {
              key: 'internal',
              label: 'Déménagements entre départements',
              value: parts.filter((p) => p.key === 'in' || p.key === 'out').reduce((s, p) => s + p.value, 0),
              note: 's’annulent à l’échelle de la France',
            },
          ]
        : parts
    return { deps, yi, metric, iS, iR, dec, bars }
  }, [why, data, baseline, result, selection, year])

  const events = useMemo(() => {
    if (!content || !contrib || contrib.sc !== scenario || !result) return null
    const full = depTotals(result)
    return eventContributions(full, contrib.list, result.nDep, content.deps, content.yi)
  }, [content, contrib, scenario, result])

  const close = () => openWhy(null)

  return (
    <dialog ref={ref} className="why" aria-labelledby="why-title" onClose={close}>
      {content && data && (
        <>
          <header className="why__head">
            <div>
              <p className="why__kicker">
                {areaName(data, selection)} · {year}
              </p>
              <h2 id="why-title" className="why__title">
                D’où vient cet écart ?
              </h2>
            </div>
            <button type="button" className="icon-btn" onClick={close} aria-label="Fermer">
              ×
            </button>
          </header>

          <p className="why__metric">
            <strong>{content.metric.label}</strong> : {content.metric.format(content.metric.value(content.iS))} dans ce scénario, contre{' '}
            {content.metric.format(content.metric.value(content.iR))} dans la référence (
            {content.metric.diff(content.metric.value(content.iS) - content.metric.value(content.iR))}).
            {content.metric.estimated && <span className="estimated-tag"> estimé</span>}
          </p>

          {Math.abs(content.dec.delta) < 1 ? (
            <p className="why__empty">
              {scenario.events.length
                ? `En ${year}, la population de la zone est identique à celle de la référence : les événements n’ont pas encore d’effet ici.`
                : 'Aucun événement : ce scénario est la référence.'}
            </p>
          ) : (
            <>
              <h3 className="why__h3">
                Écart de population : {fmtSigned(content.dec.delta)} habitants
                <span className="why__sub">
                  {' '}
                  ({fmtInt(content.dec.scenario)} contre {fmtInt(content.dec.reference)})
                </span>
              </h3>
              <p className="why__lede">Cumul depuis 2025 des différences avec la référence :</p>
              <Bars bars={content.bars} caption="Décomposition de l’écart par composante" />
              <Sentence bars={content.bars} delta={content.dec.delta} />

              <h3 className="why__h3">Part de chaque événement</h3>
              {!events ? (
                <p className="why__lede" role="status">
                  Calcul de la part de chaque événement…
                </p>
              ) : (
                <>
                  <Bars
                    caption="Part de chaque événement dans l’écart"
                    bars={[
                      ...events.map((e) => {
                        const ev = scenario.events.find((x) => x.uid === e.uid)!
                        const def = eventDef(ev.type)
                        const spawned = result?.events.some((x) => x.causedBy === ev.uid)
                        return {
                          key: e.uid,
                          label: `${def?.name ?? ev.type} (${ev.start})`,
                          value: e.value,
                          icon: def?.icon,
                          note: spawned ? 'avec ses conséquences en cascade' : undefined,
                        }
                      }),
                      {
                        key: 'cross',
                        label: 'Effets croisés',
                        value: content.dec.delta - events.reduce((s, e) => s + e.value, 0),
                        note: 'quand des événements se renforcent ou se contrarient',
                      },
                    ]}
                  />
                  <p className="why__method">
                    Méthode : on recalcule le scénario sans chaque événement ; la différence est sa part. Le reste vient des
                    événements qui agissent ensemble.
                  </p>
                </>
              )}
            </>
          )}
          <footer className="why__foot">
            <button type="button" className="btn-secondary" onClick={close}>
              Fermer
            </button>
          </footer>
        </>
      )}
    </dialog>
  )
}

function Sentence({ bars, delta }: { bars: Bar[]; delta: number }) {
  const main = [...bars].filter((b) => Math.sign(b.value) === Math.sign(delta)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]
  if (!main) return null
  const share = Math.round((100 * main.value) / delta)
  return (
    <p className="why__sentence">
      L’écart de {fmtSigned(delta)} habitants vient surtout de : <strong>{main.label.toLowerCase()}</strong> ({fmtSigned(main.value)}
      {share > 0 && share <= 400 ? `, soit l’équivalent de ${share} % de l’écart` : ''}).
    </p>
  )
}
