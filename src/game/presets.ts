import type { EventDef, Scenario, ScenarioEvent } from '../engine/types'
import { FRANCE, IDF, LITTORAL, METROPOLES, SUD } from '../events/zones'

export interface Preset {
  id: string
  title: string
  summary: string
  /** Ce qu'il faut regarder. */
  lookAt: string
  year: number
  scenario: () => Scenario
  note: string
}

const ev = (type: string, start: number, duration: number, intensity: number, zone = FRANCE): ScenarioEvent => ({
  uid: `p-${type}-${start}`,
  type,
  start,
  duration,
  intensity,
  zone,
})

const BABY_BOOM: EventDef = {
  id: 'perso-baby-boom',
  name: 'Baby-boom rejoué',
  family: 'perso',
  icon: 'babies',
  summary: 'Pendant 20 ans, les familles ont 40 % d’enfants en plus, comme après 1945.',
  defaults: { duration: 20, intensity: 1, zone: FRANCE },
  profile: 'step',
  effects: [{ kind: 'fertility', mult: 1.4 }],
  hypothesis:
    'Le baby-boom avait fait passer l’indicateur de fécondité d’environ 2,1 enfants par femme avant-guerre à près de 3 vers 1950, soit environ +40 %. On applique la même hausse relative à la fécondité d’aujourd’hui.',
  source: 'Ordre de grandeur : séries longues de fécondité de l’Insee. Hausse relative transposée : hypothèse de jeu.',
  estimated: true,
}

const base = (name: string, events: ScenarioEvent[], custom: EventDef[] = []): Scenario => ({ v: 1, name, seed: 1, randomness: 0, events, custom })

export const PRESETS: Preset[] = [
  {
    id: 'baby-boom',
    title: 'Le baby-boom rejoué',
    summary: 'Et si les années 2026-2045 connaissaient un baby-boom comparable à celui de l’après-guerre ?',
    lookAt: 'Regardez la pyramide des âges : une « bosse » de naissances traverse le siècle et gonfle les seniors après 2090.',
    year: 2060,
    scenario: () => base('Le baby-boom rejoué', [ev('perso-baby-boom', 2026, 20, 1)], [BABY_BOOM]),
    note: 'Hausse relative de 40 % appliquée à la fécondité actuelle (hypothèse de jeu).',
  },
  {
    id: 'canicule-2003',
    title: 'La canicule de 2003, tous les 5 ans',
    summary: 'Un été comme celui de 2003 revient tous les cinq ans, de 2028 à 2098.',
    lookAt: 'Peu d’effet sur la population totale, mais des « marches » de décès chez les plus âgés : regardez la courbe des décès.',
    year: 2100,
    scenario: () => base('Canicule de 2003 tous les 5 ans', Array.from({ length: 15 }, (_, i) => ev('canicule', 2028 + 5 * i, 1, 1))),
    note: 'Chaque canicule : +5 % de risque de décès après 75 ans (≈ 15 000 décès en excès en 2003, Inserm).',
  },
  {
    id: 'plus-4',
    title: 'France 2100 à +4 °C',
    summary: 'Chaleurs à répétition et sécheresses dans le Sud, mer qui monte : le pays se réorganise vers le nord.',
    lookAt: 'Suivez la cascade sur la frise : canicules → crise agricole → migration vers le nord → tension sur le logement.',
    year: 2080,
    scenario: () =>
      base('France 2100 à +4 °C', [
        ev('canicules-repetees', 2030, 70, 1, SUD),
        ev('secheresse', 2035, 15, 1, SUD),
        ev('montee-eaux', 2040, 40, 0.8, LITTORAL),
        ...[2045, 2055, 2065, 2075, 2085, 2095].map((y) => ev('canicule', y, 1, 1)),
      ]),
    note: 'Scénario fictif, inspiré de la trajectoire de réchauffement de référence pour l’adaptation (+4 °C en France en 2100) ; tous les effets sont des hypothèses de jeu.',
  },
  {
    id: 'au-vert',
    title: 'Tous au vert',
    summary: 'Télétravail généralisé et exode urbain : les grandes villes se vident au profit de l’Ouest et des campagnes.',
    lookAt: 'La carte en « écart avec la référence » : bleu à l’Ouest et dans la diagonale du vide, orange dans les métropoles.',
    year: 2060,
    scenario: () => base('Tous au vert', [ev('teletravail', 2026, 20, 1, IDF), ev('exode-urbain', 2028, 30, 1, METROPOLES)]),
    note: 'Déménagements internes : la population totale de la France ne change presque pas.',
  },
  {
    id: 'terre-accueil',
    title: 'Terre d’accueil',
    summary: 'La France double son solde migratoire et ses métropoles attirent les talents du monde entier.',
    lookAt: 'Comparez les seniors pour 100 actifs avec la référence : les arrivées, souvent jeunes, ralentissent le vieillissement.',
    year: 2070,
    scenario: () => base('Terre d’accueil', [ev('ouverture-migratoire', 2026, 74, 1), ev('boom-tech', 2028, 30, 1, METROPOLES)]),
    note: 'Valeurs d’effets : hypothèses de jeu ; le scénario « migrations hautes » de l’Insee est plus modéré.',
  },
]

export const presetById = (id: string) => PRESETS.find((p) => p.id === id)
