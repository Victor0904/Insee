import { areaDeps } from '../engine/aggregate'
import { computeIndicators, totalPop } from '../engine/indicators'
import type { ModelData, Scenario, ScenarioEvent, SimResult } from '../engine/types'
import { mulberry32 } from '../engine/rng'
import { FRANCE, IDF, LITTORAL, METROPOLES, SUD } from '../events/zones'
import { fmtDec1, fmtDec2, fmtInt, fmtSigned } from '../lib/format'

export type Question =
  | { kind: 'region'; which: 'gain' | 'loss'; year: number; text: string }
  | { kind: 'direction'; metric: 'births' | 'medianAge' | 'population' | 'seniors'; year: number; text: string }

export interface QuizRound {
  id: string
  event: Omit<ScenarioEvent, 'uid'>
  intro: string
  question: Question
  /** Explication du mécanisme, qui répond à la question posée (affichée après la réponse). */
  why: string
}

const ev = (type: string, start: number, duration: number, intensity: number, zone = FRANCE) => ({ type, start, duration, intensity, zone })

export const QUIZ: QuizRound[] = [
  {
    id: 'teletravail',
    event: ev('teletravail', 2027, 20, 1, IDF),
    intro: 'Le télétravail se généralise en 2027 : des familles quittent l’Île-de-France.',
    question: { kind: 'region', which: 'gain', year: 2050, text: 'Quelle région de métropole gagne le plus d’habitants (en %) par rapport à la référence en 2050 ?' },
    why: 'Les familles qui quittent l’Île-de-France se répartissent entre les quatre régions de l’Ouest et du Centre au prorata de leur population : toutes gagnent à peu près autant en %, et l’écart se joue ensuite sur les enfants de ces jeunes familles.',
  },
  {
    id: 'retraites',
    event: ev('reforme-retraites', 2027, 10, 1),
    intro: 'La retraite passe à 67 ans.',
    question: { kind: 'direction', metric: 'population', year: 2060, text: 'En 2060, la France a-t-elle plus, moins ou autant d’habitants que dans la référence ?' },
    why: 'L’âge de la retraite ne change ni les naissances, ni les décès, ni les déménagements : la population est exactement la même. Seul l’équilibre entre retraités et cotisants bouge.',
  },
  {
    id: 'montee-eaux',
    event: ev('montee-eaux', 2030, 30, 1, LITTORAL),
    intro: 'La mer monte : le littoral devient plus difficile à habiter dès 2030.',
    question: { kind: 'region', which: 'loss', year: 2070, text: 'Quelle région de métropole perd le plus d’habitants (en %) par rapport à la référence en 2070 ?' },
    why: 'Plus une région a de départements sur la côte, plus elle perd : là, presque tous les habitants sont concernés par les départs et par la baisse des arrivées.',
  },
  {
    id: 'nataliste',
    event: ev('politique-nataliste', 2027, 30, 1),
    intro: 'Une grande politique nataliste démarre en 2027.',
    question: { kind: 'direction', metric: 'medianAge', year: 2060, text: 'En 2060, l’âge médian est-il plus élevé, plus bas ou identique à celui de la référence ?' },
    why: 'Chaque naissance supplémentaire ajoute un habitant très jeune : la moitié la plus jeune de la population grossit, et l’âge qui sépare les deux moitiés (l’âge médian) baisse.',
  },
  {
    id: 'canicules',
    event: ev('canicules-repetees', 2030, 12, 1, SUD),
    intro: 'Les canicules s’enchaînent dans le Sud à partir de 2030.',
    question: { kind: 'region', which: 'gain', year: 2060, text: 'Quelle région de métropole gagne le plus d’habitants (en %) par rapport à la référence en 2060 ?' },
    why: 'Le Sud attire moins : ceux qui déménagent choisissent d’autres régions, surtout celles qui recevaient déjà beaucoup d’habitants du Sud.',
  },
  {
    id: 'frontieres',
    event: ev('fermeture-migratoire', 2027, 40, 1),
    intro: 'Les frontières se ferment en 2027 pour 40 ans.',
    question: { kind: 'direction', metric: 'seniors', year: 2070, text: 'En 2070, y a-t-il plus, moins ou autant de seniors pour 100 actifs que dans la référence ?' },
    why: 'Les personnes qui arrivent de l’étranger ont le plus souvent entre 20 et 40 ans. Sans elles, il manque des actifs, alors que le nombre de seniors ne change presque pas.',
  },
  {
    id: 'exode',
    event: ev('exode-urbain', 2027, 25, 1, METROPOLES),
    intro: 'Les citadins des grandes métropoles partent vivre à la campagne.',
    question: { kind: 'region', which: 'loss', year: 2050, text: 'Quelle région de métropole perd le plus d’habitants (en %) par rapport à la référence en 2050 ?' },
    why: 'Ce sont les grandes villes qui se vident. La région qui perd le plus est celle où la part des habitants vivant dans un département de grande métropole est la plus forte.',
  },
  {
    id: 'pandemie',
    event: ev('pandemie', 2030, 2, 1.5),
    intro: 'Une pandémie très violente frappe en 2030.',
    question: { kind: 'direction', metric: 'births', year: 2033, text: 'En 2033, après l’épidémie, y a-t-il plus, moins ou autant de naissances que dans la référence ?' },
    why: 'Pendant l’épidémie, des couples reportent leur projet d’enfant. Une fois le danger passé, ces naissances reportées ont lieu : on observe un rattrapage.',
  },
]

export interface Choice {
  id: string
  label: string
}

export const DIRECTION_CHOICES: Choice[] = [
  { id: 'more', label: 'Plus' },
  { id: 'less', label: 'Moins' },
  { id: 'same', label: 'Autant (écart inférieur à 0,1 %)' },
]

export const roundScenario = (r: QuizRound): Scenario => ({ v: 1, name: `Devine : ${r.id}`, seed: 1, randomness: 0, events: [{ ...r.event, uid: `q-${r.id}` }], custom: [] })

/** Bonne réponse, calculée à partir de la simulation (jamais écrite à la main). */
export function answerOf(data: ModelData, base: SimResult, res: SimResult, q: Question): { id: string; detail: string } {
  const yi = q.year - data.startYear
  if (q.kind === 'region') {
    const ranked = rankRegions(data, base, res, q)
    const best = ranked[0]
    const second = ranked[1]
    return {
      id: best.r.code,
      detail: `${best.r.name} : ${fmtSigned(100 * best.rel, fmtDec1)} % d’habitants par rapport à la référence${second ? `, devant ${second.r.name} (${fmtSigned(100 * second.rel, fmtDec1)} %)` : ''}.`,
    }
  }
  const all = areaDeps(data, { level: 'france' })
  const pick = (r: SimResult) => {
    const i = computeIndicators(data, r, all, yi)
    return q.metric === 'births' ? i.births : q.metric === 'medianAge' ? i.medianAge : q.metric === 'seniors' ? i.seniorsPer100Workers : i.population
  }
  const a = pick(res)
  const b = pick(base)
  const rel = a / b - 1
  if (q.metric === 'medianAge') {
    // écart en années (un écart d'âge en % ne parle à personne)
    const diff = a - b
    const id = Math.abs(diff) < 0.05 ? 'same' : diff > 0 ? 'more' : 'less'
    const years = Math.abs(diff) < 0.95 ? `${fmtSigned(12 * diff, fmtInt)} mois` : `${fmtSigned(diff, fmtDec1)} an${Math.abs(diff) >= 1.95 ? 's' : ''}`
    return { id, detail: `Âge médian ${fmtDec1(a)} ans, contre ${fmtDec1(b)} ans dans la référence (${years}).` }
  }
  const id = Math.abs(rel) < 0.001 ? 'same' : rel > 0 ? 'more' : 'less'
  if (q.metric === 'seniors')
    return { id, detail: `${fmtDec1(a)} seniors pour 100 actifs, contre ${fmtDec1(b)} dans la référence (${fmtSigned(a - b, fmtDec1)}).` }
  if (q.metric === 'births')
    return { id, detail: `${fmtInt(a)} naissances dans l’année, contre ${fmtInt(b)} dans la référence (${fmtSigned(100 * rel, fmtDec1)} %).` }
  return { id, detail: id === 'same' ? `Exactement ${fmtInt(a)} habitants dans les deux cas.` : `${fmtSigned(a - b, fmtInt)} habitants (${fmtSigned(100 * rel, fmtDec2)} %).` }
}

/** Régions de métropole (les questions « quelle région » portent sur elles). */
export const metroRegions = (data: ModelData) =>
  data.regions.filter((r) => areaDeps(data, { level: 'region', code: r.code }).every((d) => data.overseas[d] === 0))

/** Régions de métropole classées de la meilleure réponse à la moins bonne. */
export function rankRegions(data: ModelData, base: SimResult, res: SimResult, q: Extract<Question, { kind: 'region' }>) {
  const yi = q.year - data.startYear
  return metroRegions(data)
    .map((r) => {
      const deps = areaDeps(data, { level: 'region', code: r.code })
      return { r, rel: totalPop(res, deps, yi) / totalPop(base, deps, yi) - 1 }
    })
    .sort((a, b) => (q.which === 'gain' ? b.rel - a.rel : a.rel - b.rel))
}

/**
 * 4 régions de métropole proposées : la bonne réponse, les deux suivantes du classement (des
 * pièges crédibles) et une autre au hasard ; ordre mélangé de façon reproductible.
 */
export function regionChoices(data: ModelData, ranked: string[], seed: number): Choice[] {
  const rand = mulberry32(seed)
  const metro = metroRegions(data)
  const close = ranked.slice(0, 3)
  const rest = metro.filter((r) => !close.includes(r.code)).sort(() => rand() - 0.5)
  const codes = [...close, ...(rest.length ? [rest[0].code] : [])]
  return codes
    .sort(() => rand() - 0.5)
    .map((c) => ({ id: c, label: data.regions.find((r) => r.code === c)!.name }))
}
