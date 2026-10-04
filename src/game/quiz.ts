import { areaDeps } from '../engine/aggregate'
import { computeIndicators, totalPop } from '../engine/indicators'
import type { ModelData, Scenario, ScenarioEvent, SimResult } from '../engine/types'
import { mulberry32 } from '../engine/rng'
import { FRANCE, IDF, LITTORAL, METROPOLES, SUD } from '../events/zones'
import { fmtDec1, fmtDec2, fmtSigned } from '../lib/format'

export type Question =
  | { kind: 'region'; which: 'gain' | 'loss'; year: number; text: string }
  | { kind: 'direction'; metric: 'births' | 'medianAge' | 'population' | 'seniors'; year: number; text: string }

export interface QuizRound {
  id: string
  event: Omit<ScenarioEvent, 'uid'>
  intro: string
  question: Question
}

const ev = (type: string, start: number, duration: number, intensity: number, zone = FRANCE) => ({ type, start, duration, intensity, zone })

export const QUIZ: QuizRound[] = [
  {
    id: 'teletravail',
    event: ev('teletravail', 2027, 20, 1, IDF),
    intro: 'Le télétravail se généralise en 2027 : des familles quittent l’Île-de-France.',
    question: { kind: 'region', which: 'gain', year: 2050, text: 'Quelle région gagne le plus d’habitants (en %) par rapport à la référence en 2050 ?' },
  },
  {
    id: 'retraites',
    event: ev('reforme-retraites', 2027, 10, 1),
    intro: 'La retraite passe à 67 ans.',
    question: { kind: 'direction', metric: 'population', year: 2060, text: 'En 2060, la France a-t-elle plus, moins ou autant d’habitants que dans la référence ?' },
  },
  {
    id: 'montee-eaux',
    event: ev('montee-eaux', 2030, 30, 1, LITTORAL),
    intro: 'La mer monte : le littoral devient plus difficile à habiter dès 2030.',
    question: { kind: 'region', which: 'loss', year: 2070, text: 'Quelle région perd le plus d’habitants (en %) par rapport à la référence en 2070 ?' },
  },
  {
    id: 'nataliste',
    event: ev('politique-nataliste', 2027, 30, 1),
    intro: 'Une grande politique nataliste démarre en 2027.',
    question: { kind: 'direction', metric: 'medianAge', year: 2060, text: 'En 2060, l’âge médian est-il plus élevé, plus bas ou identique à celui de la référence ?' },
  },
  {
    id: 'canicules',
    event: ev('canicules-repetees', 2030, 12, 1, SUD),
    intro: 'Les canicules s’enchaînent dans le Sud à partir de 2030.',
    question: { kind: 'region', which: 'gain', year: 2060, text: 'Quelle région gagne le plus d’habitants (en %) par rapport à la référence en 2060 ?' },
  },
  {
    id: 'frontieres',
    event: ev('fermeture-migratoire', 2027, 40, 1),
    intro: 'Les frontières se ferment en 2027 pour 40 ans.',
    question: { kind: 'direction', metric: 'seniors', year: 2070, text: 'En 2070, y a-t-il plus, moins ou autant de seniors pour 100 actifs que dans la référence ?' },
  },
  {
    id: 'exode',
    event: ev('exode-urbain', 2027, 25, 1, METROPOLES),
    intro: 'Les citadins des grandes métropoles partent vivre à la campagne.',
    question: { kind: 'region', which: 'loss', year: 2050, text: 'Quelle région perd le plus d’habitants (en %) par rapport à la référence en 2050 ?' },
  },
  {
    id: 'pandemie',
    event: ev('pandemie', 2030, 2, 1.5),
    intro: 'Une pandémie très violente frappe en 2030.',
    question: { kind: 'direction', metric: 'births', year: 2033, text: 'En 2033, après l’épidémie, y a-t-il plus, moins ou autant de naissances que dans la référence ?' },
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
    const ranked = data.regions
      .map((r) => {
        const deps = areaDeps(data, { level: 'region', code: r.code })
        return { r, rel: totalPop(res, deps, yi) / totalPop(base, deps, yi) - 1 }
      })
      .sort((a, b) => (q.which === 'gain' ? b.rel - a.rel : a.rel - b.rel))
    const best = ranked[0]
    return { id: best.r.code, detail: `${best.r.name} : ${fmtSigned(100 * best.rel, fmtDec1)} % d’habitants par rapport à la référence.` }
  }
  const all = areaDeps(data, { level: 'france' })
  const pick = (r: SimResult) => {
    const i = computeIndicators(data, r, all, yi)
    return q.metric === 'births' ? i.births : q.metric === 'medianAge' ? i.medianAge : q.metric === 'seniors' ? i.seniorsPer100Workers : i.population
  }
  const a = pick(res)
  const b = pick(base)
  const rel = a / b - 1
  const id = Math.abs(rel) < 0.001 ? 'same' : rel > 0 ? 'more' : 'less'
  return { id, detail: `${fmtSigned(100 * rel, fmtDec2)} % par rapport à la référence.` }
}

/** 4 régions proposées : la bonne réponse et 3 autres, ordre mélangé de façon reproductible. */
export function regionChoices(data: ModelData, correct: string, seed: number): Choice[] {
  const rand = mulberry32(seed)
  const others = data.regions.filter((r) => r.code !== correct).sort(() => rand() - 0.5).slice(0, 3)
  const all = [...others, data.regions.find((r) => r.code === correct)!]
  return all.sort(() => rand() - 0.5).map((r) => ({ id: r.code, label: r.name }))
}
