import { useEffect, useId, useRef } from 'react'
import { useApp } from '../../state/appStore'
import { Icon } from '../common/Icon'
import './Timeline.css'

/** Années par seconde à vitesse ×1. */
const BASE_RATE = 2

/** Avance l'année tant que la lecture est active. */
function usePlayback() {
  const playing = useApp((s) => s.playing)
  const speed = useApp((s) => s.speed)
  const acc = useRef(0)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    acc.current = 0
    const tick = (now: number) => {
      acc.current += ((now - last) / 1000) * BASE_RATE * speed
      last = now
      if (acc.current >= 1) {
        const steps = Math.floor(acc.current)
        acc.current -= steps
        const { year, data, setYear, setPlaying } = useApp.getState()
        if (!data) return
        if (year + steps >= data.endYear) {
          setYear(data.endYear)
          setPlaying(false)
          return
        }
        setYear(year + steps)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])
}

export function Timeline() {
  const data = useApp((s) => s.data)!
  const year = useApp((s) => s.year)
  const setYear = useApp((s) => s.setYear)
  const playing = useApp((s) => s.playing)
  const setPlaying = useApp((s) => s.setPlaying)
  const speed = useApp((s) => s.speed)
  const setSpeed = useApp((s) => s.setSpeed)
  const horizon = useApp((s) => s.officialHorizon)
  const sliderId = useId()
  usePlayback()

  const { startYear: y0, endYear: y1 } = data
  const pct = (y: number) => ((y - y0) / (y1 - y0)) * 100
  const ticks = []
  for (let y = y0; y <= y1; y += 5) ticks.push(y)
  const nextSpeed = speed === 1 ? 2 : speed === 2 ? 4 : 1

  return (
    <section className="timeline" aria-label="Frise chronologique">
      <div className="timeline__controls">
        <button
          type="button"
          className="btn-primary timeline__play"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Mettre en pause' : year >= y1 ? 'Rejouer depuis 2025' : 'Lancer le temps'}
        >
          <Icon name={playing ? 'pause' : year >= y1 ? 'restart' : 'play'} size={22} />
          <span className="timeline__play-text">{playing ? 'Pause' : year >= y1 ? 'Rejouer' : 'Lancer'}</span>
        </button>
        <button
          type="button"
          className="timeline__speed"
          onClick={() => setSpeed(nextSpeed)}
          aria-label={`Vitesse ×${speed}. Passer à ×${nextSpeed}`}
        >
          ×{speed}
        </button>
        <output className="timeline__year" htmlFor={sliderId} aria-live="off">
          {year}
        </output>
      </div>
      <div className="timeline__track-wrap">
        <div className="timeline__track" aria-hidden="true">
          <div className="timeline__beyond" style={{ left: `${pct(horizon)}%` }} title="Au-delà des projections officielles" />
          <div className="timeline__progress" style={{ width: `${pct(year)}%` }} />
          {ticks.map((t) => (
            <span key={t} className={`timeline__tick ${t % 25 === 0 ? 'timeline__tick--major' : ''}`} style={{ left: `${pct(t)}%` }}>
              {t % 25 === 0 && <span className="timeline__tick-label">{t}</span>}
            </span>
          ))}
        </div>
        <input
          id={sliderId}
          className="timeline__slider"
          type="range"
          min={y0}
          max={y1}
          step={1}
          value={year}
          onChange={(e) => {
            if (playing) setPlaying(false)
            setYear(Number(e.target.value))
          }}
          aria-label="Année affichée"
          aria-valuetext={`${year}${year > horizon ? ', au-delà des projections officielles' : ''}`}
        />
      </div>
    </section>
  )
}
