/** Formats français : 1 234 567 ; 12,5 % ; signe moins typographique. */
const MINUS = '−'
const NBSP = ' '
const NNBSP = ' '

const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dec2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fixMinus = (s: string) => s.replace(/^-/, MINUS)

export const fmtInt = (x: number) => fixMinus(intFmt.format(Math.round(x)))
export const fmtDec1 = (x: number) => fixMinus(dec1.format(x))
export const fmtDec2 = (x: number) => fixMinus(dec2.format(x))
export const fmtPct = (x: number, digits = 1) =>
  `${fixMinus(new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(100 * x))}${NBSP}%`

/** Nombre signé : « + 1 234 » / « − 1 234 » / « 0 ». */
export function fmtSigned(x: number, format: (v: number) => string = fmtInt): string {
  const s = format(Math.abs(x))
  if (s.replace(/[^1-9]/g, '') === '') return format(0)
  return `${x > 0 ? '+' : MINUS}${NNBSP}${s}`
}

/** Millions avec une décimale : « 66,7 millions ». */
export const fmtMillions = (x: number) => `${dec1.format(x / 1e6)}${NBSP}millions`
