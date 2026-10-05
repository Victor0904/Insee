import { areaDeps } from '../engine/aggregate'
import { compSum, computeIndicators, totalPop } from '../engine/indicators'
import { COMP_EXT, type EventFamily, type ModelData, type Scenario, type ScenarioEvent, type SimResult, type Zone } from '../engine/types'
import { zoneDeps } from '../engine/zones'
import { fmtDec1, fmtDec2, fmtInt, fmtMillions, fmtPct } from '../lib/format'
import { EVENT_LIBRARY, INSEE_VARIANTS } from '../events/library'
import { DIAGONALE, IDF, METROPOLES } from '../events/zones'

export interface ChallengeContext {
  data: ModelData
  baseline: SimResult
  result: SimResult
  scenario: Scenario
}

/** Garde-fou : condition à respecter en plus de l'objectif (limite les effets de bord). */
export interface ChallengeGuard {
  label: string
  ok: boolean
  /** Valeur mesurée, en clair (affichée une fois le résultat révélé). */
  value?: string
}

export interface ChallengeCheck {
  /** Valeur mesurée et cible, pour la jauge de progression. */
  value: number
  target: number
  /** Sens de l'objectif. */
  dir: 'atLeast' | 'atMost'
  format: (v: number) => string
  guards?: ChallengeGuard[]
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
  /** Année de début la plus précoce pour les événements du joueur (hors événements imposés). */
  earliestStart?: number
  /** Familles d'événements autorisées (toutes si absent). */
  allowedFamilies?: EventFamily[]
  /** Événements imposés : ils doivent rester dans le scénario. */
  required?: string[]
  hint: string
  check: (c: ChallengeContext) => ChallengeCheck
  /** Une solution qui réussit le défi (vérifiée par les tests). */
  solution: Omit<ScenarioEvent, 'uid'>[]
}

/**
 * Règles communes à tous les défis :
 * - les variantes Insee sont des cadrages officiels, pas des leviers : elles sont interdites ;
 * - l'intensité est plafonnée à « forte » (sauf pour un événement imposé par le défi).
 */
export const CHALLENGE_MAX_INTENSITY = 1
const INSEE_IDS = INSEE_VARIANTS.map((e) => e.id)
/** Événements de la bibliothèque interdits dans un défi (variantes Insee, interdits propres, familles exclues). */
export const forbiddenIn = (ch: Challenge): string[] => [
  ...INSEE_IDS,
  ...(ch.forbidden ?? []),
  ...(ch.allowedFamilies ? EVENT_LIBRARY.filter((e) => !ch.allowedFamilies!.includes(e.family) && !(ch.required ?? []).includes(e.id)).map((e) => e.id) : []),
].filter((id, i, a) => a.indexOf(id) === i)

const FR: Zone = { level: 'france', codes: [] }
const fr = (d: ModelData) => areaDeps(d, { level: 'france' })
const yiOf = (d: ModelData, y: number) => y - d.startYear
const ind = (c: ChallengeContext, deps: number[], y: number) => computeIndicators(c.data, c.result, deps, yiOf(c.data, y))
const people = (v: number) => (v >= 1e6 ? fmtMillions(v) : fmtInt(v))

/** Solde migratoire extérieur moyen par an de la France entre deux années. */
function avgExternal(c: ChallengeContext, from: number, to: number): number {
  const all = fr(c.data)
  let t = 0
  for (let y = from; y < to; y++) t += compSum(c.result, all, yiOf(c.data, y), COMP_EXT)
  return t / Math.max(1, to - from)
}

/** Garde-fou migratoire : au plus `max` arrivées nettes de l'étranger par an en moyenne. */
function externalGuard(c: ChallengeContext, from: number, to: number, max = 250_000): ChallengeGuard {
  const v = avgExternal(c, from, to)
  return { label: `Au plus ${fmtInt(max)} arrivées nettes de l’étranger par an en moyenne (${from}-${to})`, ok: v <= max, value: `${fmtInt(v)} par an` }
}

/** Écart extrême d'un département à la référence (rapport − 1), en perte ou en gain. */
function depExtreme(c: ChallengeContext, y: number, side: 'loss' | 'gain'): { rel: number; name: string } {
  const yi = yiOf(c.data, y)
  let best = { rel: 0, name: '' }
  for (let d = 0; d < c.data.nDep; d++) {
    const b = totalPop(c.baseline, [d], yi)
    if (b <= 0) continue
    const rel = totalPop(c.result, [d], yi) / b - 1
    if (side === 'loss' ? rel < best.rel : rel > best.rel) best = { rel, name: c.data.departments[d].name }
  }
  return best
}

function noLossGuard(c: ChallengeContext, y: number, maxLoss: number): ChallengeGuard {
  const w = depExtreme(c, y, 'loss')
  return {
    label: `Aucun département ne perd plus de ${fmtPct(maxLoss, 0)} d’habitants par rapport à la référence en ${y}`,
    ok: w.rel >= -maxLoss - 1e-9,
    value: w.name ? `${w.name} : ${fmtPct(w.rel)}` : 'aucune perte',
  }
}

function noGainGuard(c: ChallengeContext, y: number, maxGain: number): ChallengeGuard {
  const w = depExtreme(c, y, 'gain')
  return {
    label: `Aucun département ne gagne plus de ${fmtPct(maxGain, 0)} d’habitants par rapport à la référence en ${y}`,
    ok: w.rel <= maxGain + 1e-9,
    value: w.name ? `${w.name} : +${fmtPct(w.rel)}` : 'aucun gain',
  }
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'actifs-seniors',
    title: 'Des bras pour les retraites',
    goal: 'Atteindre au moins 1,72 personne en âge de travailler par senior en 2070, sans dépasser 250 000 arrivées nettes de l’étranger par an.',
    measure: 'Actifs (20-64 ans) par senior (65 ans et plus) en 2070',
    year: 2070,
    maxEvents: 3,
    hint: 'Il faut plus de jeunes adultes, et l’immigration seule ne suffira pas : combinez naissances, arrivées et attractivité, tôt et longtemps.',
    check: (c) => ({
      value: ind(c, fr(c.data), 2070).workersPerSenior,
      target: 1.72,
      dir: 'atLeast',
      format: (v) => fmtDec2(v),
      guards: [externalGuard(c, 2026, 2070)],
    }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 44, intensity: 1, zone: FR },
      { type: 'boom-tech', start: 2026, duration: 44, intensity: 1, zone: METROPOLES },
      { type: 'relocalisation', start: 2026, duration: 44, intensity: 1, zone: FR },
    ],
  },
  {
    id: 'creuse',
    title: 'Sauver la Creuse',
    goal: 'Garder la Creuse au-dessus de 100 000 habitants en 2100, sans vider un autre département.',
    measure: 'Habitants de la Creuse en 2100',
    year: 2100,
    maxEvents: 3,
    hint: 'La Creuse perd des habitants parce qu’elle vieillit. Visez-la directement : qui pourrait avoir envie de s’y installer, et d’y fonder une famille ?',
    check: (c) => ({
      value: totalPop(c.result, areaDeps(c.data, { level: 'dep', code: '23' }), yiOf(c.data, 2100)),
      target: 100000,
      dir: 'atLeast',
      format: people,
      guards: [noLossGuard(c, 2100, 0.03)],
    }),
    solution: [
      { type: 'ouverture-migratoire', start: 2026, duration: 50, intensity: 1, zone: { level: 'dep', codes: ['23'] } },
      { type: 'relocalisation', start: 2026, duration: 50, intensity: 1, zone: { level: 'dep', codes: ['23'] } },
      { type: 'boom-tech', start: 2026, duration: 50, intensity: 1, zone: { level: 'dep', codes: ['23'] } },
    ],
  },
  {
    id: 'diagonale',
    title: 'Repeupler la diagonale du vide',
    goal: 'En 2060, les 18 départements peu denses de la diagonale comptent au moins 10 % d’habitants de plus qu’en 2025, sans l’exode urbain.',
    measure: 'Habitants de la diagonale du vide en 2060 (objectif : 2025 + 10 %)',
    year: 2060,
    maxEvents: 3,
    forbidden: ['exode-urbain'],
    hint: 'Sans l’exode urbain, créez votre propre événement ou attirez des arrivants directement dans ces départements.',
    check: (c) => {
      const deps = zoneDeps(c.data, DIAGONALE)
      return { value: totalPop(c.result, deps, yiOf(c.data, 2060)), target: 1.1 * totalPop(c.baseline, deps, 0), dir: 'atLeast', format: people }
    },
    solution: [
      { type: 'relocalisation', start: 2026, duration: 34, intensity: 1, zone: DIAGONALE },
      { type: 'boom-tech', start: 2026, duration: 34, intensity: 1, zone: DIAGONALE },
    ],
  },
  {
    id: 'pas-de-declin',
    title: 'Pas de déclin',
    goal: 'La France compte en 2100 au moins autant d’habitants qu’en 2025 (68,9 millions), sans dépasser 250 000 arrivées nettes de l’étranger par an.',
    measure: 'Habitants en 2100 (comparés à 2025)',
    year: 2100,
    maxEvents: 3,
    hint: 'La référence descend sous 60 millions : les décès dépassent les naissances dès les années 2030. Les arrivées seules ne suffiront pas sans dépasser la limite.',
    check: (c) => ({
      value: totalPop(c.result, fr(c.data), yiOf(c.data, 2100)),
      target: totalPop(c.baseline, fr(c.data), 0),
      dir: 'atLeast',
      format: people,
      guards: [externalGuard(c, 2026, 2100)],
    }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 50, intensity: 1, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 50, intensity: 0.6, zone: FR },
      { type: 'progres-medical', start: 2026, duration: 30, intensity: 1, zone: FR },
    ],
  },
  {
    id: 'ecoles',
    title: 'Des enfants dans les écoles',
    goal: 'Avoir encore au moins 5,4 millions d’enfants de 3 à 10 ans en 2050 (il y en a 5,8 millions en 2025), sans dépasser 250 000 arrivées nettes de l’étranger par an.',
    measure: 'Enfants de 3 à 10 ans en 2050 (places d’école, estimées)',
    year: 2050,
    maxEvents: 3,
    hint: 'Les enfants de 2050 naîtront entre 2040 et 2047 : il faut agir tôt et durablement, sur les naissances comme sur les jeunes familles.',
    check: (c) => ({
      value: ind(c, fr(c.data), 2050).schoolPlaces,
      target: 5.4e6,
      dir: 'atLeast',
      format: people,
      guards: [externalGuard(c, 2026, 2050)],
    }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 24, intensity: 1, zone: FR },
      { type: 'boom-tech', start: 2026, duration: 24, intensity: 1, zone: METROPOLES },
    ],
  },
  {
    id: 'idf',
    title: 'Desserrer l’Île-de-France',
    goal: 'L’Île-de-France passe sous 11,5 millions d’habitants en 2050 par des politiques et des choix de société (pas de catastrophe ni de crise), sans que la France perde plus de 0,5 % d’habitants et sans qu’un département gagne plus de 10 %.',
    measure: 'Habitants de l’Île-de-France en 2050',
    year: 2050,
    maxEvents: 3,
    allowedFamilies: ['politique', 'societe', 'perso'],
    hint: 'Les habitants doivent partir ailleurs en France, pas disparaître, et se répartir : un seul point de chute déborde. Un effet rapide compte plus qu’un effet long.',
    check: (c) => {
      const y = yiOf(c.data, 2050)
      const all = fr(c.data)
      const fRel = totalPop(c.result, all, y) / totalPop(c.baseline, all, y) - 1
      return {
        value: totalPop(c.result, zoneDeps(c.data, IDF), y),
        target: 11.5e6,
        dir: 'atMost',
        format: people,
        guards: [
          { label: 'France : pas plus de 0,5 % d’habitants en moins que la référence', ok: fRel >= -0.005, value: fmtPct(fRel) },
          noGainGuard(c, 2050, 0.1),
        ],
      }
    },
    solution: [
      { type: 'teletravail', start: 2026, duration: 1, intensity: 1, zone: IDF },
      { type: 'decentralisation', start: 2026, duration: 24, intensity: 1, zone: IDF },
    ],
  },
  {
    id: 'retraites',
    title: 'Des retraites tenables',
    goal: 'Ramener à 53 au plus le nombre de personnes en âge de retraite pour 100 cotisants en 2070 (66 dans la référence).',
    measure: 'Retraités pour 100 cotisants en 2070 (estimé)',
    year: 2070,
    maxEvents: 2,
    hint: 'Une réforme seule ne suffit pas tout à fait : il faut aussi plus de cotisants.',
    check: (c) => ({ value: ind(c, fr(c.data), 2070).pensionPressure, target: 53, dir: 'atMost', format: (v) => fmtDec1(v) }),
    solution: [
      { type: 'reforme-retraites', start: 2026, duration: 10, intensity: 1, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 44, intensity: 1, zone: FR },
    ],
  },
  {
    id: 'rajeunir',
    title: 'Rajeunir la France',
    goal: 'Garder l’âge médian sous 50,5 ans en 2070 (51,6 ans dans la référence), sans dépasser 250 000 arrivées nettes de l’étranger par an.',
    measure: 'Âge médian en 2070',
    year: 2070,
    maxEvents: 3,
    hint: 'L’âge médian bouge lentement : seuls des effets massifs et durables le font baisser.',
    check: (c) => ({
      value: ind(c, fr(c.data), 2070).medianAge,
      target: 50.5,
      dir: 'atMost',
      format: (v) => `${fmtDec1(v)} ans`,
      guards: [externalGuard(c, 2026, 2070)],
    }),
    solution: [
      { type: 'politique-nataliste', start: 2026, duration: 44, intensity: 1, zone: FR },
      { type: 'ouverture-migratoire', start: 2026, duration: 44, intensity: 0.6, zone: FR },
    ],
  },
  {
    id: 'pandemie',
    title: 'Résister à la pandémie',
    goal: 'Une pandémie extrême frappe en 2030. Vous réagissez après coup (vos événements commencent en 2031 au plus tôt) : en 2040, la France doit compter au moins 1,2 million d’habitants de plus que la référence, sans dépasser 200 000 arrivées nettes de l’étranger par an.',
    measure: 'Habitants en 2040 (objectif : référence + 1,2 million)',
    year: 2040,
    maxEvents: 3,
    required: ['pandemie'],
    earliestStart: 2031,
    hint: 'La pandémie est déjà posée (elle doit rester) : il vous reste 2 événements pour compenser, et un seul ne suffira pas.',
    check: (c) => {
      const y = yiOf(c.data, 2040)
      return {
        value: totalPop(c.result, fr(c.data), y),
        target: totalPop(c.baseline, fr(c.data), y) + 1.2e6,
        dir: 'atLeast',
        format: people,
        guards: [externalGuard(c, 2031, 2040, 200_000)],
      }
    },
    solution: [
      { type: 'pandemie', start: 2030, duration: 2, intensity: 1.5, zone: FR },
      { type: 'progres-medical', start: 2031, duration: 1, intensity: 1, zone: FR },
      { type: 'politique-nataliste', start: 2031, duration: 9, intensity: 1, zone: FR },
    ],
  },
]

/** Anciens identifiants de défis (meilleurs scores enregistrés sous l'ancien nom). */
export const RENAMED_CHALLENGES: Record<string, string> = { 'soixante-six': 'pas-de-declin' }

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
  /** Événements réglés au-delà de l'intensité « forte » (hors événements imposés). */
  tooStrong: string[]
  /** Événements qui commencent avant l'année autorisée (hors événements imposés). */
  tooEarly: string[]
  score: number
  stars: 0 | 1 | 2 | 3
}

/** Évalue un défi ; score sur 1 000 : réussite, sobriété (événements non utilisés) et marge. */
export function evaluateChallenge(ch: Challenge, c: ChallengeContext): ChallengeStatus {
  const check = ch.check(c)
  const eventsUsed = c.scenario.events.length
  const banned = forbiddenIn(ch)
  const forbiddenUsed = [...new Set(c.scenario.events.filter((e) => banned.includes(e.type)).map((e) => e.type))]
  const requiredMissing = (ch.required ?? []).filter((r) => !c.scenario.events.some((e) => e.type === r))
  const tooStrong = [
    ...new Set(c.scenario.events.filter((e) => e.intensity > CHALLENGE_MAX_INTENSITY + 1e-9 && !(ch.required ?? []).includes(e.type)).map((e) => e.type)),
  ]
  const tooEarly = ch.earliestStart
    ? [...new Set(c.scenario.events.filter((e) => e.start < ch.earliestStart! && !(ch.required ?? []).includes(e.type)).map((e) => e.type))]
    : []
  const reached = check.dir === 'atLeast' ? check.value >= check.target : check.value <= check.target
  const guardsOk = (check.guards ?? []).every((g) => g.ok)
  const success =
    reached && guardsOk && eventsUsed <= ch.maxEvents && forbiddenUsed.length === 0 && requiredMissing.length === 0 && tooStrong.length === 0 && tooEarly.length === 0
  if (!success) return { check, success, eventsUsed, forbiddenUsed, requiredMissing, tooStrong, tooEarly, score: 0, stars: 0 }
  const margin = Math.abs(check.value - check.target) / Math.max(1e-9, Math.abs(check.target))
  const spare = ch.maxEvents - eventsUsed
  const score = Math.round(600 + 150 * spare + Math.min(250, 2500 * margin))
  const stars: 1 | 2 | 3 = spare > 0 && margin >= 0.02 ? 3 : spare > 0 || margin >= 0.05 ? 2 : 1
  return { check, success, eventsUsed, forbiddenUsed, requiredMissing, tooStrong, tooEarly, score: Math.min(1000, score), stars }
}

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id)
