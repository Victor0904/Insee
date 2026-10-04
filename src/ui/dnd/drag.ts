import { create } from 'zustand'
import { useApp } from '../../state/appStore'
import { placeEvent } from '../../state/actions'

export type DropTarget = { kind: 'map'; dep: number } | { kind: 'timeline'; year: number } | null

interface DragState {
  type: string | null
  x: number
  y: number
  over: DropTarget
}

export const useDrag = create<DragState>(() => ({ type: null, x: 0, y: 0, over: null }))

/** Cible sous le pointeur : un département de la carte ou une année de la frise. */
function targetAt(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y) as Element | null
  if (!el) return null
  const dep = el.closest('[data-dep]')
  if (dep) return { kind: 'map', dep: Number(dep.getAttribute('data-dep')) }
  const tl = el.closest('[data-drop="timeline"]') as HTMLElement | null
  if (tl) {
    const r = tl.getBoundingClientRect()
    const y0 = Number(tl.dataset.y0)
    const y1 = Number(tl.dataset.y1)
    const t = Math.max(0, Math.min(1, (x - r.left) / r.width))
    return { kind: 'timeline', year: Math.round(y0 + t * (y1 - y0)) }
  }
  return null
}

/**
 * Démarre un glisser depuis une carte de la bibliothèque. Le glisser ne commence qu'après
 * 5 px de déplacement : un simple clic reste un clic.
 */
export function beginDrag(type: string, e: PointerEvent | React.PointerEvent) {
  if (e.button !== 0) return
  // évite la sélection de texte et le glisser natif du navigateur (qui annulerait le pointeur)
  e.preventDefault()
  const sx = e.clientX
  const sy = e.clientY
  let started = false
  const move = (ev: PointerEvent) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      started = true
      document.body.classList.add('is-dragging')
      useApp.setState({ libraryOpen: false })
    }
    ev.preventDefault()
    useDrag.setState({ type, x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) })
  }
  const end = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', cancel)
    document.body.classList.remove('is-dragging')
    if (started) {
      const over = targetAt(ev.clientX, ev.clientY)
      const data = useApp.getState().data
      if (over?.kind === 'map' && data) placeEvent(type, { zone: { level: 'dep', codes: [data.departments[over.dep].code] } })
      else if (over?.kind === 'timeline') placeEvent(type, { start: over.year })
    }
    useDrag.setState({ type: null, over: null })
  }
  const cancel = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', cancel)
    document.body.classList.remove('is-dragging')
    useDrag.setState({ type: null, over: null })
  }
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', cancel)
}
