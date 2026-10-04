/** Icônes SVG au trait (24 × 24, trait 1,75). Décoratives par défaut : aria-hidden. */
const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  restart: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  auto: 'M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18',
  flows: 'M4 17c4-8 12-8 16 0M16 13l4 4-4 1',
  close: 'M6 6l12 12M18 6 6 18',
  chart: 'M4 19h16M7 16V9m5 7V5m5 11v-4',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  chevron: 'm9 6 6 6-6 6',
  speed: 'M4 6l7 6-7 6zM12 6l7 6-7 6z',
  map: 'M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zm0 0v13m6-10.5v13',
  save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm0 13a3 3 0 0 1 3-3h11',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  const filled = name === 'play' || name === 'pause'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}
