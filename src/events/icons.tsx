/** Icônes des événements : traits SVG 24 × 24 (pas d'emoji). */
export const EVENT_ICONS: Record<string, string> = {
  virus:
    'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1M10 11h.01M13.5 13.5h.01',
  medical: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-3.5v-1',
  heat: 'M12 3v10.5a3.5 3.5 0 1 0 4 0V5a2 2 0 0 0-4 0M14 9h-2M18 3l2-1m0 6 2 1',
  heatwaves: 'M10 4v9.5a3 3 0 1 0 3 0V4a1.5 1.5 0 0 0-3 0M16 8c1.5-1 3-1 4 0M16 12c1.5-1 3-1 4 0M3 8c1-1 2.5-1 4 0',
  wave: 'M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-3 5 0M2 20c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-3 5 0M12 3v8m-3-3 3 3 3-3',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM8 18l8-8',
  flood: 'M4 11 12 4l8 7M6 10v4m12-4v4M2 18c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2.5 5 0',
  factory: 'M3 21V10l6 4v-4l6 4V5h4l2 16zM7 17h2m4 0h2',
  chip: 'M7 7h10v10H7zM10 10h4v4h-4zM10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4',
  closed: 'M3 21V10l6 4v-4l6 4V5h4l2 16zM5 5l14 14',
  relocate: 'M3 21V12l5 3v-3l5 3V8h3l2 13zM14 4h7m-3-3 3 3-3 3',
  baby: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 21v-4a6 6 0 0 1 12 0v4M9 14h6',
  retire: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2M9 2h6',
  doorOpen: 'M4 21h16M6 21V4h8v17M14 6l5-2v17M11 12h.01',
  doorClosed: 'M4 21h16M6 21V4h12v17M14 12h.01M9 8h6',
  columns: 'M3 9 12 4l9 5M4 21h16M6 10v8m4-8v8m4-8v8m4-8v8',
  laptop: 'M3 18h18M5 16V6h14v10M9 9l6 4M15 9l-3 1',
  tree: 'M12 3 6 12h3l-4 6h14l-4-6h3zM12 18v3',
  city: 'M3 21V9l5-3v15M8 21V3h8v18M16 21v-9l5 2v7M11 7h2m-2 4h2m-2 4h2',
  alert: 'M12 3 2 20h20zM12 10v4m0 3h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  wheat: 'M12 21V9M12 9c-3 0-4-3-4-5 2 0 4 1 4 5zm0 0c3 0 4-3 4-5-2 0-4 1-4 5zm0 5c-3 0-4-3-4-5 2 0 4 1 4 5zm0 0c3 0 4-3 4-5-2 0-4 1-4 5z',
  north: 'M12 21V4m-5 5 5-5 5 5M5 21h14',
  house: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5',
  babies: 'M8 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm8 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 20v-3a5 5 0 0 1 10 0m-2 3v-3a5 5 0 0 1 10 0v3',
  custom: 'M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8M9.1 14.9l-2.8 2.8',
}

export function EventIcon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={EVENT_ICONS[name] ?? EVENT_ICONS.custom} />
    </svg>
  )
}
