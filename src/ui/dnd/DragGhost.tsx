import { useApp } from '../../state/appStore'
import { eventDef } from '../../state/actions'
import { EventIcon } from '../../events/icons'
import { useDrag } from './drag'
import './DragGhost.css'

/** Vignette qui suit le pointeur pendant un glisser, avec la consigne de dépôt. */
export function DragGhost() {
  const { type, x, y, over } = useDrag()
  const data = useApp((s) => s.data)
  if (!type || !data) return null
  const def = eventDef(type)
  const hint =
    over?.kind === 'map'
      ? `Lâcher sur ${data.departments[over.dep].name}`
      : over?.kind === 'timeline'
        ? `Lâcher en ${over.year}`
        : 'Lâchez sur un département ou sur la frise'
  return (
    <div className="ghost" style={{ transform: `translate(${x + 14}px, ${y + 14}px)` }} aria-hidden="true">
      <EventIcon name={def?.icon ?? 'custom'} size={20} />
      <span className="ghost__name">{def?.name}</span>
      <span className="ghost__hint">{hint}</span>
    </div>
  )
}
