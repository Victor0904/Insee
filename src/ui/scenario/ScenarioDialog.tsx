import { useEffect, useId, useRef, useState } from 'react'
import { areaName } from '../../engine/aggregate'
import { useApp } from '../../state/appStore'
import { departmentsCsv, zoneCsv } from '../../state/exports'
import { useGame } from '../../state/gameStore'
import { deleteSave, download, listSaves, saveScenario, shareUrl, slug, validateScenario, type SavedScenario } from '../../state/persistence'
import { useScenario } from '../../state/scenarioStore'
import { exportMapPng } from '../map/exportPng'
import { mapLegend } from './mapLegend'
import './ScenarioDialog.css'

const dateFr = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Scénario : nom, sauvegardes locales, partage, exports, import, aléa. */
export function ScenarioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const scenario = useScenario((s) => s.scenario)
  const setScenario = useScenario((s) => s.setScenario)
  const setRandomness = useScenario((s) => s.setRandomness)
  const say = useGame((s) => s.say)
  const [saves, setSaves] = useState<SavedScenario[]>([])
  const [link, setLink] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [name, setName] = useState(scenario.name)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setSaves(listSaves())
      setName(useScenario.getState().scenario.name)
      setLink('')
      setConfirm(null)
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])

  const app = () => useApp.getState()
  const rename = () => {
    const n = name.trim() || 'Mon scénario'
    if (n !== scenario.name) setScenario({ ...scenario, name: n }, `Renommage : ${n}`)
  }

  const save = () => {
    rename()
    const n = name.trim() || 'Mon scénario'
    if (saveScenario(n, { ...useScenario.getState().scenario, name: n })) {
      setSaves(listSaves())
      say(`Scénario « ${n} » enregistré sur cet appareil.`)
    } else say('Enregistrement impossible : le stockage du navigateur est indisponible.')
  }

  const share = async () => {
    const url = await shareUrl(useScenario.getState().scenario)
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      say('Lien copié : il contient tout le scénario.')
    } catch {
      say('Copiez le lien affiché ci-dessous.')
    }
  }

  const exportPng = async () => {
    const svg = document.querySelector<SVGSVGElement>('.map:not(.map--decorative) .map__svg')
    const { data, year, selection } = app()
    if (!svg || !data) return
    try {
      const blob = await exportMapPng({
        svg,
        title: `Et si… ? ${scenario.name}`,
        subtitle: `${mapLegend.title} · ${year} · ${scenario.events.length} événement(s) · ${areaName(data, selection)}`,
        legendTitle: mapLegend.title,
        colors: mapLegend.colors,
        labels: mapLegend.labels,
        hatchedClasses: mapLegend.hatched,
        source: 'Simulation « Et si… ? » à partir des données Insee (Licence Ouverte). Effets des événements : variantes Insee, épisodes historiques ou hypothèses de jeu (voir chaque fiche).',
      })
      download(`et-si-${slug(scenario.name)}-${year}.png`, blob)
    } catch (e) {
      say(e instanceof Error ? e.message : 'Export PNG impossible')
    }
  }

  const csv = (kind: 'zone' | 'deps') => {
    const { data, baseline, result, selection, year } = app()
    if (!data || !baseline || !result) return
    if (kind === 'zone') download(`et-si-${slug(areaName(data, selection))}.csv`, zoneCsv(data, baseline, result, selection), 'text/csv;charset=utf-8')
    else download(`et-si-departements-${year}.csv`, departmentsCsv(data, baseline, result, year - data.startYear), 'text/csv;charset=utf-8')
  }

  const importFile = async (f: File) => {
    try {
      const sc = validateScenario(JSON.parse(await f.text()))
      if (!sc) throw new Error()
      setScenario(sc, `Import : ${sc.name}`)
      useGame.getState().setMode('sandbox')
      say(`Scénario « ${sc.name} » importé (${sc.events.length} événement(s)).`)
      onClose()
    } catch {
      say('Ce fichier n’est pas un scénario « Et si… ? » valide.')
    }
  }

  return (
    <dialog ref={ref} className="scen" aria-labelledby={`${id}-t`} onClose={onClose}>
      <header className="scen__head">
        <h2 id={`${id}-t`} className="scen__title">
          Mon scénario
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>

      <section className="scen__section">
        <label className="field">
          <span className="field__label">Nom</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={rename} />
        </label>
        <p className="scen__meta">
          {scenario.events.length} événement(s) posé(s){scenario.custom.length ? `, ${scenario.custom.length} événement(s) créé(s)` : ''}.
        </p>
        <div className="scen__row">
          <button type="button" className="btn-primary" onClick={save}>
            Enregistrer sur cet appareil
          </button>
        </div>
      </section>

      <section className="scen__section" aria-labelledby={`${id}-saves`}>
        <h3 id={`${id}-saves`} className="scen__h3">
          Mes scénarios enregistrés
        </h3>
        {saves.length === 0 ? (
          <p className="scen__meta">Aucun pour l’instant. Ils restent dans ce navigateur, sur cet appareil.</p>
        ) : (
          <ul className="scen__saves">
            {saves.map((s) => (
              <li key={s.name}>
                <span className="scen__save-name">
                  {s.name}
                  <span className="scen__meta">
                    {' '}
                    · {s.scenario.events.length} événement(s) · {dateFr(s.savedAt)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-secondary scen__small"
                  onClick={() => {
                    setScenario(s.scenario, `Chargement : ${s.name}`)
                    useGame.getState().setMode('sandbox')
                    onClose()
                  }}
                  aria-label={`Charger ${s.name}`}
                >
                  Charger
                </button>
                <button
                  type="button"
                  className="btn-ghost scen__small"
                  onClick={() => {
                    if (confirm !== s.name) return setConfirm(s.name)
                    deleteSave(s.name)
                    setSaves(listSaves())
                    setConfirm(null)
                  }}
                  aria-label={confirm === s.name ? `Confirmer la suppression de ${s.name}` : `Supprimer ${s.name}`}
                >
                  {confirm === s.name ? 'Confirmer ?' : 'Supprimer'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="scen__section" aria-labelledby={`${id}-share`}>
        <h3 id={`${id}-share`} className="scen__h3">
          Partager et exporter
        </h3>
        <div className="scen__grid">
          <button type="button" className="btn-secondary" onClick={share}>
            Copier le lien de partage
          </button>
          <button type="button" className="btn-secondary" onClick={exportPng}>
            Image de la carte (PNG)
          </button>
          <button type="button" className="btn-secondary" onClick={() => csv('zone')}>
            Données de la zone (CSV)
          </button>
          <button type="button" className="btn-secondary" onClick={() => csv('deps')}>
            Tous les départements (CSV)
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => download(`et-si-${slug(scenario.name)}.json`, JSON.stringify(useScenario.getState().scenario, null, 2), 'application/json')}
          >
            Exporter le scénario (JSON)
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            Importer un scénario (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Fichier de scénario à importer"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {link && (
          <label className="field scen__link">
            <span className="field__label">Lien de partage</span>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
        )}
      </section>

      <section className="scen__section" aria-labelledby={`${id}-alea`}>
        <h3 id={`${id}-alea`} className="scen__h3">
          Aléa
        </h3>
        <p className="scen__meta">
          Ajoute de petites variations reproductibles aux naissances, aux décès et aux migrations, chaque année. Le même
          tirage donne toujours le même résultat.
        </p>
        <label className="field">
          <span className="field__label">
            Intensité de l’aléa : <strong>{scenario.randomness === 0 ? 'aucun' : `${Math.round(scenario.randomness * 100)} %`}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={scenario.randomness}
            onChange={(e) => setRandomness(Number(e.target.value))}
            aria-valuetext={scenario.randomness === 0 ? 'aucun' : `${Math.round(scenario.randomness * 100)} %`}
          />
        </label>
        <div className="scen__row">
          <span className="scen__meta">Tirage n° {scenario.seed}</span>
          <button type="button" className="btn-secondary scen__small" disabled={scenario.randomness === 0} onClick={() => setRandomness(scenario.randomness, 1 + Math.floor(Math.random() * 99999))}>
            Nouveau tirage
          </button>
        </div>
      </section>

      <footer className="scen__foot">
        <button
          type="button"
          className="btn-ghost btn-danger"
          onClick={() => {
            if (confirm !== '__clear') return setConfirm('__clear')
            useScenario.getState().clear()
            setConfirm(null)
            onClose()
          }}
        >
          {confirm === '__clear' ? 'Confirmer : tout effacer (Ctrl+Z pour revenir)' : 'Tout effacer'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Fermer
        </button>
      </footer>
    </dialog>
  )
}
