/**
 * Mode test : fonctions expérimentales, cachées par défaut.
 * `?test=1` l'active (et le retient sur cet appareil), `?test=0` le désactive.
 */
const KEY = 'etsi:test'

export function isTestMode(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get('test')
    if (p === '1') localStorage.setItem(KEY, '1')
    if (p === '0') localStorage.removeItem(KEY)
    return p === '1' || (p !== '0' && localStorage.getItem(KEY) === '1')
  } catch {
    return new URLSearchParams(window.location.search).get('test') === '1'
  }
}
