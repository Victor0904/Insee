import { useEffect, useState } from 'react'
import type { Topology } from 'topojson-specification'
import { compileData } from './engine/compile'
import { fetchRawData, fetchReference } from './data/load'
import { useApp } from './state/appStore'
import { initSimulation } from './state/simClient'
import { AppShell } from './ui/layout/AppShell'
import { MethodPage } from './ui/pages/MethodPage'
import { useResolvedTheme } from './ui/theme'
import './App.css'

const fetchTopo = async (): Promise<Topology> => {
  const r = await fetch(`${import.meta.env.BASE_URL}data/departements.topo.json`)
  if (!r.ok) throw new Error('Contours des départements introuvables')
  return (await r.json()) as Topology
}

function useRoute() {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => {
      setHash(location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.startsWith('#/comment-ca-marche') ? 'method' : 'home'
}

export function App() {
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)
  const route = useRoute()
  useResolvedTheme()

  useEffect(() => {
    Promise.all([initSimulation(), fetchRawData(), fetchReference(), fetchTopo()])
      .then(([baseline, raw, reference, topo]) => {
        const data = compileData(raw)
        useApp.setState({
          status: 'ready',
          data,
          reference,
          topo,
          baseline,
          result: baseline,
          officialHorizon: raw.meta.officialHorizon,
          year: data.startYear,
        })
      })
      .catch((e: unknown) => useApp.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }))
  }, [])

  if (status === 'loading')
    return (
      <div className="splash" role="status">
        <p className="splash__mark">Et si… ?</p>
        <p>Chargement des données de l’Insee et calcul du scénario de référence…</p>
      </div>
    )
  if (status === 'error')
    return (
      <div className="splash" role="alert">
        <p className="splash__mark">Et si… ?</p>
        <p>Les données n’ont pas pu être chargées : {error}</p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          Réessayer
        </button>
      </div>
    )
  return route === 'method' ? <MethodPage /> : <AppShell />
}
