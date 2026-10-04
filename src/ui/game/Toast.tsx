import { useGame } from '../../state/gameStore'

/** Message bref (contraintes de défi, réussites), annoncé aux lecteurs d'écran. */
export function Toast() {
  const toast = useGame((s) => s.toast)
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && <p className="toast">{toast}</p>}
    </div>
  )
}
