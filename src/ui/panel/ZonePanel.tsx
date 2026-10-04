import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { areaDeps, areaName, type AreaRef } from '../../engine/aggregate'
import { totalPop } from '../../engine/indicators'
import { fmtDec1, fmtInt, fmtMillions, fmtSigned } from '../../lib/format'
import { useApp } from '../../state/appStore'
import { Curves } from '../analysis/Curves'
import { Indicators } from '../analysis/Indicators'
import { Pyramid } from '../analysis/Pyramid'
import { SmallMultiples } from '../analysis/SmallMultiples'
import { StoryBlock } from '../story/StoryBlock'
import './ZonePanel.css'

const encode = (a: AreaRef) => (a.level === 'france' ? 'FR' : `${a.level}:${a.code}`)
const decode = (v: string): AreaRef => {
  if (v === 'FR') return { level: 'france' }
  const [level, code] = v.split(':')
  return level === 'region' ? { level: 'region', code } : { level: 'dep', code }
}

const TABS = [
  { id: 'synthese', label: 'Synthèse' },
  { id: 'pyramide', label: 'Pyramide' },
  { id: 'courbes', label: 'Courbes' },
  { id: 'regions', label: 'Régions' },
] as const
type TabId = (typeof TABS)[number]['id']

export function ZonePanel() {
  const data = useApp((s) => s.data)!
  const baseline = useApp((s) => s.baseline)!
  const result = useApp((s) => s.result)!
  const year = useApp((s) => s.year)
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  const horizon = useApp((s) => s.officialHorizon)
  const openWhy = useApp((s) => s.openWhy)
  const pickId = useId()
  const tabsId = useId()
  const [tab, setTab] = useState<TabId>('synthese')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const deps = useMemo(() => areaDeps(data, selection), [data, selection])
  const yi = year - data.startYear
  const pop = totalPop(result, deps, yi)
  const ref = totalPop(baseline, deps, yi)
  const pop0 = totalPop(result, deps, 0)
  const regionOfSel =
    selection.level === 'dep' ? data.departments.find((d) => d.code === selection.code)?.reg : selection.level === 'region' ? selection.code : undefined
  const name = areaName(data, selection)
  const delta = pop - ref
  const same = Math.abs(delta) < 0.5

  // onglets : flèches gauche/droite, Début, Fin (motif ARIA « tabs »)
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="zone" aria-labelledby="zone-title">
      {selection.level !== 'france' && (
        <nav className="zone__crumbs" aria-label="Niveau géographique">
          <button type="button" className="crumb" onClick={() => select({ level: 'france' })}>
            France
          </button>
          {regionOfSel && (
            <>
              <span aria-hidden="true">›</span>
              <button
                type="button"
                className="crumb"
                onClick={() => select({ level: 'region', code: regionOfSel })}
                aria-current={selection.level === 'region' ? 'true' : undefined}
              >
                {data.regions.find((r) => r.code === regionOfSel)?.name}
              </button>
            </>
          )}
        </nav>
      )}
      <h2 id="zone-title" className="zone__title">
        {name}
      </h2>
      <label htmlFor={pickId} className="sr-only">
        Choisir une autre zone
      </label>
      <select id={pickId} className="select zone__pick" value={encode(selection)} onChange={(e) => select(decode(e.target.value))}>
        <option value="FR">France métropolitaine</option>
        <optgroup label="Régions">
          {data.regions.map((r) => (
            <option key={r.code} value={`region:${r.code}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
        {data.regions.map((r) => (
          <optgroup key={r.code} label={`Départements — ${r.name}`}>
            {data.departments
              .filter((d) => d.reg === r.code)
              .map((d) => (
                <option key={d.code} value={`dep:${d.code}`}>
                  {d.name} ({d.code})
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <div className="zone__headline">
        <button
          type="button"
          className="zone__pop"
          onClick={() => openWhy('population')}
          aria-label={`${fmtInt(pop)} habitants au 1er janvier ${year}${same ? ', comme la référence' : `, ${fmtSigned(delta)} par rapport à la référence`}. D’où vient cet écart ?`}
        >
          <span className="zone__pop-value">{pop >= 1e6 ? fmtMillions(pop) : fmtInt(pop)}</span>
          <span className="zone__pop-label">habitants au 1er janvier {year}</span>
        </button>
        <p className="zone__compare">
          {same ? (
            <span className="chip chip--ref">comme la référence</span>
          ) : (
            <button type="button" className={`chip chip--btn ${delta > 0 ? 'chip--gain' : 'chip--loss'}`} onClick={() => openWhy('population')}>
              {fmtSigned(delta)} par rapport à la référence
              <span className="chip__why">D’où vient cet écart ?</span>
            </button>
          )}
          <span className="zone__since">{fmtSigned((100 * (pop - pop0)) / pop0, fmtDec1)} % depuis 2025</span>
        </p>
        {year > horizon && <p className="zone__warn">Au-delà de 2070 : hypothèses prolongées par le jeu.</p>}
      </div>

      <StoryBlock />

      <div className="tabs" role="tablist" aria-label="Analyse détaillée">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${tabsId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-${t.id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="tabpanel" tabIndex={0}>
        {tab === 'synthese' && <Indicators data={data} baseline={baseline} result={result} deps={deps} yi={yi} />}
        {tab === 'pyramide' && <Pyramid baseline={baseline} result={result} deps={deps} yi={yi} year={year} zone={name} />}
        {tab === 'courbes' && <Curves data={data} baseline={baseline} result={result} deps={deps} zone={name} />}
        {tab === 'regions' && <SmallMultiples data={data} baseline={baseline} result={result} />}
      </div>
    </section>
  )
}
