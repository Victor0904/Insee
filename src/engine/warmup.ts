import type { Scenario } from './types'

/**
 * Scénario d'échauffement : un événement par type d'effet (mortalité, fécondité, départs, attractivité,
 * déménagements, étranger, retraite), avec et sans tranche d'âge. Simulé quelques fois au démarrage,
 * il évite que le moteur JavaScript ne désoptimise la simulation la première fois qu'un joueur pose
 * un nouveau type d'événement (pointes de 150 ms mesurées sans lui).
 */
export const WARMUP_SCENARIO: Scenario = {
  v: 1,
  name: 'échauffement',
  seed: 1,
  randomness: 0,
  custom: [],
  events: [
    { uid: 'w1', type: 'pandemie', start: 2026, duration: 2, intensity: 1, zone: { level: 'france', codes: [] } },
    { uid: 'w2', type: 'teletravail', start: 2027, duration: 10, intensity: 1, zone: { level: 'region', codes: ['11'] } },
    { uid: 'w3', type: 'ouverture-migratoire', start: 2028, duration: 10, intensity: 1, zone: { level: 'france', codes: [] } },
    { uid: 'w4', type: 'canicules-repetees', start: 2029, duration: 10, intensity: 1, zone: { level: 'region', codes: ['93'] } },
    { uid: 'w5', type: 'reforme-retraites', start: 2030, duration: 5, intensity: 1, zone: { level: 'france', codes: [] } },
    { uid: 'w6', type: 'crise-mondiale', start: 2031, duration: 4, intensity: 1, zone: { level: 'france', codes: [] } },
    { uid: 'w7', type: 'catastrophe', start: 2032, duration: 1, intensity: 1, zone: { level: 'dep', codes: ['06'] } },
    { uid: 'w8', type: 'progres-medical', start: 2033, duration: 10, intensity: 1, zone: { level: 'france', codes: [] } },
  ],
}
