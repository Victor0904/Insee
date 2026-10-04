import { areaDeps } from '../engine/aggregate'
import { computeIndicators, totalPop } from '../engine/indicators'
import type { ModelData, Scenario, ScenarioEvent, SimResult, Zone } from '../engine/types'
import { zoneDeps } from '../engine/zones'
import { fmtDec1, fmtDec2, fmtInt, fmtMillions } from '../lib/format'
import { DIAGONALE, IDF } from '../events/zones'

export interface ChallengeContext {
  data: ModelData
  baseline: SimResult
  result: SimResult
  scenario: Scenario
}

export interface ChallengeCheck {
  /** Valeur mesurée et cible, pour la jauge de progression. */
  value: number
  target: number
  /** Sens de l'objectif. */
  dir: 'atLeast' | 'atMost'
  format: (v: number) => string
  /** Condition supplémentaire éventuelle (ex. ne pas perdre d'habitants en France). */
  extraOk?: boolean
  extraLabel?: string
}

export interface Challenge {
  id: string
  title: string
  goal: string
  /** Indicateur suivi, en langage simple. */
  measure: string
  year: number
  maxEvents: number
  forbidden?: string[]
  /** Événements imposés : ils doivent rester dans le scénario. */
  required?: string[]
  hint: string
  check: (c: ChallengeContext) => ChallengeCheck
  /** Une solution qui réussit le défi (vérifiée par les tests). */
  solution: Omit<ScenarioEvent, 'uid'>[]
}

const FR: Zone = { level: 'france', codes: [] }
const fr = (d: ModelData) => areaDeps(d, { level: 'france' })
const yiOf = (d: ModelData, y: number) => y - d.startYear
const ind = (c: ChallengeContext, deps: number[], y: number) => computeIndicators(c.data, c.result, deps, yiOf(c.data, y))
const people = (v: number) => (v >= 1e6 ? fmtMillions(v) : fmtInt(v))

export const CHALLENGES: Challenge[] = [
  {
    id: 'actifs-seniors',
    title: 'Des bras pour les retraites',
    goal: 'Atteindre au moins 1,7 personne en âge de travailler par senior en 2070.',
    measure: 'Actifs (20-64 ans) par senior (65 ans et plus) en 2070',
    year: 2070,
    maxEvents: 3,
    hint: 'Il faut plus de jeunes adultes : naissances et arrivées de l’étranger sont vos leviers, mais ils mettent du temps à agir.',
    check: (c) => ({ value: ind(c, fr(c.data), 2070).workersPerSenior, target: 1.7, dir: 'atLeast', format: (v) => fmtDec2(v) }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 44, intensity: 1.5, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 44, intensity: 1.5, zone: FR },
    ],
  },
  {
    id: 'creuse',
    title: 'Sauver la Creuse',
    goal: 'Garder la Creuse au-dessus de 100 000 habitants en 2100.',
    measure: 'Habitants de la Creuse en 2100',
    year: 2100,
    maxEvents: 3,
    hint: 'La Creuse perd des habitants parce qu’elle vieillit. Qui pourrait avoir envie de s’y installer ?',
    check: (c) => ({ value: totalPop(c.result, areaDeps(c.data, { level: 'dep', code: '23' }), yiOf(c.data, 2100)), target: 100000, dir: 'atLeast', format: people }),
    solution: [{ type: 'exode-urbain', start: 2026, duration: 74, intensity: 1.5, zone: { level: 'dep', codes: ['75', '92', '93', '94', '69', '13', '31', '33', '59', '44', '67', '34', '35', '38', '06'] } }],
  },
  {
    id: 'diagonale',
    title: 'Repeupler la diagonale du vide',
    goal: 'En 2060, les 18 départements peu denses de la diagonale comptent au moins autant d’habitants qu’en 2025, sans l’exode urbain.',
    measure: 'Habitants de la diagonale du vide en 2060 (comparés à 2025)',
    year: 2060,
    maxEvents: 3,
    forbidden: ['exode-urbain'],
    hint: 'Sans l’exode urbain, créez votre propre événement ou attirez des arrivants directement dans ces départements.',
    check: (c) => {
      const deps = zoneDeps(c.data, DIAGONALE)
      return { value: totalPop(c.result, deps, yiOf(c.data, 2060)), target: totalPop(c.baseline, deps, 0), dir: 'atLeast', format: people }
    },
    solution: [
      { type: 'ouverture-migratoire', start: 2026, duration: 35, intensity: 1.5, zone: DIAGONALE },
      { type: 'relocalisation', start: 2026, duration: 35, intensity: 1.5, zone: DIAGONALE },
      { type: 'politique-nataliste', start: 2026, duration: 35, intensity: 1.5, zone: DIAGONALE },
    ],
  },
  {
    id: 'soixante-six',
    title: 'Pas de déclin',
    goal: 'La France compte au moins 68 millions d’habitants en 2100, autant qu’aujourd’hui.',
    measure: 'Habitants en 2100',
    year: 2100,
    maxEvents: 3,
    hint: 'La référence descend sous 60 millions : les décès dépassent les naissances dès les années 2030.',
    check: (c) => ({ value: totalPop(c.result, fr(c.data), yiOf(c.data, 2100)), target: 68e6, dir: 'atLeast', format: people }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 74, intensity: 1, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 74, intensity: 1, zone: FR },
    ],
  },
  {
    id: 'ecoles',
    title: 'Des enfants dans les écoles',
    goal: 'Avoir encore au moins 5 millions d’enfants de 3 à 10 ans en 2050 (il y en a 5,8 millions en 2025).',
    measure: 'Enfants de 3 à 10 ans en 2050 (places d’école, estimées)',
    year: 2050,
    maxEvents: 3,
    hint: 'Les enfants de 2050 naîtront entre 2040 et 2047 : il faut agir tôt et durablement.',
    check: (c) => ({ value: ind(c, fr(c.data), 2050).schoolPlaces, target: 5e6, dir: 'atLeast', format: people }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 24, intensity: 1.5, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 24, intensity: 1.5, zone: FR },
    ],
  },
  {
    id: 'idf',
    title: 'Desserrer l’Île-de-France',
    goal: 'L’Île-de-France passe sous 12 millions d’habitants en 2050, sans que la France perde plus de 0,5 % d’habitants par rapport à la référence.',
    measure: 'Habitants de l’Île-de-France en 2050',
    year: 2050,
    maxEvents: 3,
    hint: 'Les habitants doivent partir ailleurs en France, pas disparaître.',
    check: (c) => {
      const y = yiOf(c.data, 2050)
      const all = fr(c.data)
      const ok = totalPop(c.result, all, y) >= totalPop(c.baseline, all, y) * 0.995
      return {
        value: totalPop(c.result, zoneDeps(c.data, IDF), y),
        target: 12e6,
        dir: 'atMost',
        format: people,
        extraOk: ok,
        extraLabel: 'France : pas plus de 0,5 % d’habitants en moins que la référence',
      }
    },
    solution: [
      { type: 'teletravail', start: 2026, duration: 24, intensity: 1.5, zone: IDF },
      { type: 'decentralisation', start: 2026, duration: 24, intensity: 1.5, zone: IDF },
    ],
  },
  {
    id: 'retraites',
    title: 'Des retraites tenables',
    goal: 'Ramener à 54 au plus le nombre de personnes en âge de retraite pour 100 cotisants en 2070 (67 dans la référence).',
    measure: 'Retraités pour 100 cotisants en 2070 (estimé)',
    year: 2070,
    maxEvents: 2,
    hint: 'Une réforme seule ne suffit pas tout à fait : il faut aussi plus de cotisants.',
    check: (c) => ({ value: ind(c, fr(c.data), 2070).pensionPressure, target: 54, dir: 'atMost', format: (v) => fmtDec1(v) }),
    solution: [
      { type: 'reforme-retraites', start: 2026, duration: 10, intensity: 1, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 44, intensity: 1, zone: FR },
    ],
  },
  {
    id: 'rajeunir',
    title: 'Rajeunir la France',
    goal: 'Garder l’âge médian sous 50,5 ans en 2070 (52 ans dans la référence).',
    measure: 'Âge médian en 2070',
    year: 2070,
    maxEvents: 3,
    hint: 'L’âge médian bouge lentement : seuls des effets massifs et durables le font baisser.',
    check: (c) => ({ value: ind(c, fr(c.data), 2070).medianAge, target: 50.5, dir: 'atMost', format: (v) => `${fmtDec1(v)} ans` }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 44, intensity: 1.5, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 44, intensity: 1.5, zone: FR },
    ],
  },
  {
    id: 'pandemie',
    title: 'Résister à la pandémie',
    goal: 'Une pandémie extrême frappe en 2030. Faites en sorte que la France compte au moins autant d’habitants que la référence en 2040, avec 2 événements de plus.',
    measure: 'Habitants en 2040 (comparés à la référence)',
    year: 2040,
    maxEvents: 3,
    required: ['pandemie'],
    hint: 'La pandémie est déjà posée (elle doit rester) : il vous reste 2 événements pour compenser.',
    check: (c) => {
      const y = yiOf(c.data, 2040)
      return { value: totalPop(c.result, fr(c.data), y), target: totalPop(c.baseline, fr(c.data), y), dir: 'atLeast', format: people }
    },
    solution: [
      { type: 'pandemie', start: 2030, duration: 2, intensity: 1.5, zone: FR },
      { type: 'progres-medical', start: 2026, duration: 6, intensity: 1.5, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 14, intensity: 1, zone: FR },
    ],
  },
]

/** Événements imposés au départ de certains défis. */
export const CHALLENGE_START: Record<string, Omit<ScenarioEvent, 'uid'>[]> = {
  pandemie: [{ type: 'pandemie', start: 2030, duration: 2, intensity: 1.5, zone: FR }],
}

export interface ChallengeStatus {
  check: ChallengeCheck
  success: boolean
  eventsUsed: number
  forbiddenUsed: string[]
  requiredMissing: string[]
  score: number
  stars: 0 | 1 | 2 | 3
}

/** Évalue un défi ; score sur 1 000 : réussite, sobriété (événements non utilisés) et marge. */
export function evaluateChallenge(ch: Challenge, c: ChallengeContext): ChallengeStatus {
  const check = ch.check(c)
  const eventsUsed = c.scenario.events.length
  const forbiddenUsed = (ch.forbidden ?? []).filter((f) => c.scenario.events.some((e) => e.type === f))
  const requiredMissing = (ch.required ?? []).filter((r) => !c.scenario.events.some((e) => e.type === r))
  const reached = check.dir === 'atLeast' ? check.value >= check.target : check.value <= check.target
  const success = reached && check.extraOk !== false && eventsUsed <= ch.maxEvents && forbiddenUsed.length === 0 && requiredMissing.length === 0
  if (!success) return { check, success, eventsUsed, forbiddenUsed, requiredMissing, score: 0, stars: 0 }
  const margin = Math.abs(check.value - check.target) / Math.max(1e-9, Math.abs(check.target))
  const spare = ch.maxEvents - eventsUsed
  const score = Math.round(600 + 150 * spare + Math.min(250, 2500 * margin))
  const stars: 1 | 2 | 3 = spare > 0 && margin >= 0.02 ? 3 : spare > 0 || margin >= 0.05 ? 2 : 1
  return { check, success, eventsUsed, forbiddenUsed, requiredMissing, score: Math.min(1000, score), stars }
}

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id)
