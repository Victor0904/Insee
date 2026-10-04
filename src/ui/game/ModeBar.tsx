import { setMode } from '../../game/gameActions'
import { useGame, type GameMode } from '../../state/gameStore'
import './ModeBar.css'

const MODES: { id: GameMode; label: string }[] = [
  { id: 'sandbox', label: 'Bac à sable' },
  { id: 'challenges', label: 'Défis' },
  { id: 'guess', label: 'Devine' },
  { id: 'presets', label: 'Scénarios célèbres' },
]

/** Choix du mode de jeu (boutons sur grand écran, liste déroulante sur petit). */
export function ModeBar() {
  const mode = useGame((s) => s.mode)
  return (
    <nav className="modes" aria-label="Mode de jeu">
      <div className="modes__buttons">
        {MODES.map((m) => (
          <button key={m.id} type="button" className="mode" aria-current={mode === m.id ? 'page' : undefined} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <label className="modes__select">
        <span className="sr-only">Mode de jeu</span>
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
