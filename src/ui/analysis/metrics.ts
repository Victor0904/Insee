import type { Indicators } from '../../engine/indicators'
import { RATIOS } from '../../engine/indicators'
import { fmtDec1, fmtInt, fmtMillions, fmtSigned } from '../../lib/format'

export type MetricId =
  | 'population'
  | 'medianAge'
  | 'seniors'
  | 'workers'
  | 'pension'
  | 'births'
  | 'deaths'
  | 'migration'
  | 'school'
  | 'ehpad'

export interface Metric {
  id: MetricId
  label: string
  technical: string
  value: (i: Indicators) => number
  format: (v: number) => string
  /** Écart lisible (unités adaptées). */
  diff: (d: number) => string
  /** Méthode d'estimation : présent si la valeur repose sur un ratio du jeu. */
  estimated?: string
}

const people = (v: number) => (Math.abs(v) >= 1e6 ? fmtMillions(v) : fmtInt(v))

export const METRICS: Metric[] = [
  {
    id: 'population',
    label: 'Habitants',
    technical: 'Population au 1er janvier',
    value: (i) => i.population,
    format: people,
    diff: (d) => fmtSigned(d),
  },
  {
    id: 'medianAge',
    label: 'Âge médian',
    technical: 'Âge médian : la moitié de la population est plus jeune',
    value: (i) => i.medianAge,
    format: (v) => `${fmtDec1(v)} ans`,
    diff: (d) => `${fmtSigned(d, fmtDec1)} an`,
  },
  {
    id: 'seniors',
    label: 'Seniors pour 100 actifs',
    technical: 'Rapport de dépendance des âgés : 65 ans et plus / 20-64 ans × 100',
    value: (i) => i.seniorsPer100Workers,
    format: (v) => fmtInt(v),
    diff: (d) => fmtSigned(d, fmtDec1),
  },
  {
    id: 'workers',
    label: 'Personnes en âge de travailler',
    technical: 'Population de 20 à 64 ans',
    value: (i) => i.workingAge,
    format: people,
    diff: (d) => fmtSigned(d),
  },
  {
    id: 'pension',
    label: 'Retraités pour 100 cotisants',
    technical: `Pression sur les retraites : personnes ayant l’âge de la retraite (${RATIOS.retirementAge} ans sans réforme) pour 100 personnes de 20 ans à cet âge`,
    value: (i) => i.pensionPressure,
    format: (v) => fmtInt(v),
    diff: (d) => fmtSigned(d, fmtDec1),
    estimated: 'Ratio démographique simple : ne tient pas compte du taux d’emploi ni des règles de calcul des pensions.',
  },
  {
    id: 'births',
    label: 'Naissances dans l’année',
    technical: 'Naissances vivantes domiciliées',
    value: (i) => i.births,
    format: fmtInt,
    diff: (d) => fmtSigned(d),
  },
  {
    id: 'deaths',
    label: 'Décès dans l’année',
    technical: 'Décès domiciliés',
    value: (i) => i.deaths,
    format: fmtInt,
    diff: (d) => fmtSigned(d),
  },
  {
    id: 'migration',
    label: 'Arrivées moins départs',
    technical: 'Solde migratoire (interne et extérieur) de l’année',
    value: (i) => i.migrationBalance,
    format: (v) => fmtSigned(v),
    diff: (d) => fmtSigned(d),
  },
  {
    id: 'school',
    label: 'Places d’école nécessaires',
    technical: 'Enfants de 3 à 10 ans (maternelle et élémentaire)',
    value: (i) => i.schoolPlaces,
    format: people,
    diff: (d) => fmtSigned(d),
    estimated: 'Une place par enfant de 3 à 10 ans : ratio simple, voir « Comment ça marche ».',
  },
  {
    id: 'ehpad',
    label: 'Places en EHPAD nécessaires',
    technical: 'Personnes de 85 ans et plus × 20 %',
    value: (i) => i.ehpadPlaces,
    format: people,
    diff: (d) => fmtSigned(d),
    estimated: 'Hypothèse de jeu : 1 personne de 85 ans et plus sur 5 vit en établissement (ordre de grandeur).',
  },
]

export const metricById = (id: MetricId) => METRICS.find((m) => m.id === id)!
