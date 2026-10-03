import { useEffect, useState } from 'react'
import { useApp } from '../state/appStore'

export type Theme = 'light' | 'dark'

/**
 * Palettes des données, adaptées aux daltoniens.
 * - divergente bleu (gain) / orange (perte) autour d'un neutre papier ;
 * - séquentielle de type cividis (bleu foncé → jaune).
 */
export const PALETTES: Record<Theme, { diverging: string[]; sequential: string[]; flow: string; selection: string }> = {
  light: {
    // 4 pertes, neutre, 4 gains
    diverging: ['#7a3c06', '#b0600f', '#dd9442', '#f4c995', '#ece9e1', '#b3cfe8', '#6f9fd0', '#3a70b0', '#1b4b86'],
    sequential: ['#00224e', '#203a6f', '#47506d', '#66686f', '#828073', '#a29a73', '#c5b56b', '#e8d158', '#fdea45'],
    flow: '#18202b',
    selection: '#18202b',
  },
  dark: {
    diverging: ['#f5a85c', '#d9893c', '#a8692d', '#6a4423', '#2a323d', '#294c6e', '#3f72a6', '#6b9fd6', '#a8cdf2'],
    sequential: ['#1a2f5c', '#2d4479', '#4f5b7b', '#6d7179', '#8b8878', '#aca077', '#cdb96f', '#ebd25d', '#fdea45'],
    flow: '#eceae3',
    selection: '#eceae3',
  },
}

const prefersDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches

/** Thème effectif (préférence de l'utilisateur ou du système), appliqué sur <html data-theme>. */
export function useResolvedTheme(): Theme {
  const pref = useApp((s) => s.theme)
  const [system, setSystem] = useState<Theme>(prefersDark() ? 'dark' : 'light')
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const theme = pref === 'system' ? system : pref
  useEffect(() => {
    if (pref === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', pref)
  }, [pref])
  return theme
}

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}
