import { challengeById } from '../../game/challenges'
import { useApp } from '../../state/appStore'
import { useGame } from '../../state/gameStore'
import { useChallengeReveal, useChallengeStatus } from './ChallengePanel'

/** Pastille de progression du défi, visible au-dessus de la carte (utile quand le panneau est replié). */
export function ChallengePill() {
  const id = useGame((s) => s.challengeId)
  const status = useChallengeStatus()
  const revealed = useChallengeReveal()
  const setLibraryOpen = useApp((s) => s.setLibraryOpen)
  const ch = id ? challengeById(id) : undefined
  if (!ch || !status) return null
  const c = status.check
  if (!revealed)
    return (
      <button type="button" className="pill" onClick={() => setLibraryOpen(true)} aria-label={`Défi ${ch.title} : résultat révélé en ${ch.year}, lancez le temps. Ouvrir le défi.`}>
        <span aria-hidden="true">◎</span> Résultat en {ch.year}
      </button>
    )
  return (
    <button
      type="button"
      className={`pill ${status.success ? 'pill--ok' : ''}`}
      onClick={() => setLibraryOpen(true)}
      aria-label={`Défi ${ch.title} : ${c.format(c.value)}, objectif ${c.format(c.target)}${status.success ? ', réussi' : ''}. Ouvrir le défi.`}
    >
      <span aria-hidden="true">{status.success ? '✓' : '◎'}</span> {c.format(c.value)} <span className="pill__target">/ {c.format(c.target)}</span>
    </button>
  )
}
