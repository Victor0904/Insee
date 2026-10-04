import type { Zone } from '../engine/types'

/**
 * Zones prédéfinies utilisées par les événements.
 * Ce sont des listes de travail du jeu, pas des zonages officiels : elles sont expliquées
 * dans la fiche de chaque événement et modifiables par le joueur.
 */

export const FRANCE: Zone = { level: 'france', codes: [] }

/** Départements de métropole ayant une façade maritime (Manche, Atlantique, Méditerranée). */
export const LITTORAL: Zone = {
  level: 'dep',
  codes: ['59', '62', '80', '76', '27', '14', '50', '35', '22', '29', '56', '44', '85', '17', '33', '40', '64', '66', '11', '34', '30', '13', '83', '06', '2A', '2B'],
}

/** Départements et régions d'outre-mer. */
export const OUTRE_MER: Zone = { level: 'dep', codes: ['971', '972', '973', '974', '976'] }

/** Sud : Occitanie, Provence-Alpes-Côte d'Azur, Corse. */
export const SUD: Zone = { level: 'region', codes: ['76', '93', '94'] }

/** Moitié nord : Hauts-de-France, Normandie, Bretagne, Grand Est. */
export const NORD: Zone = { level: 'region', codes: ['32', '28', '53', '44'] }

/** Départements des grandes métropoles (Paris et petite couronne, Lyon, Marseille, Toulouse, Bordeaux, Lille, Nantes, Strasbourg, Montpellier, Rennes, Grenoble, Nice). */
export const METROPOLES: Zone = {
  level: 'dep',
  codes: ['75', '92', '93', '94', '69', '13', '31', '33', '59', '44', '67', '34', '35', '38', '06'],
}

/** Île-de-France. */
export const IDF: Zone = { level: 'region', codes: ['11'] }

/**
 * « Diagonale du vide » : départements peu denses des Ardennes aux Landes.
 * Liste indicative, la notion n'ayant pas de définition officielle.
 */
export const DIAGONALE: Zone = {
  level: 'dep',
  codes: ['08', '55', '52', '10', '89', '58', '18', '36', '23', '03', '19', '15', '43', '48', '12', '46', '32', '24'],
}

/** Ouest et Centre attractifs pour le télétravail : Bretagne, Pays de la Loire, Nouvelle-Aquitaine, Centre-Val de Loire. */
export const OUEST: Zone = { level: 'region', codes: ['53', '52', '75', '24'] }

/** Vieux bassins industriels : Hauts-de-France, Grand Est. */
export const INDUSTRIEL: Zone = { level: 'region', codes: ['32', '44'] }

/** Départements des capitales régionales hors Île-de-France (accueil d'administrations décentralisées). */
export const CAPITALES_REGIONALES: Zone = {
  level: 'dep',
  codes: ['45', '21', '76', '59', '67', '44', '35', '33', '31', '69', '13', '2A'],
}

export const NAMED_ZONES: { id: string; label: string; zone: Zone; note: string }[] = [
  { id: 'france', label: 'Toute la France', zone: FRANCE, note: '101 départements, outre-mer compris' },
  { id: 'outre-mer', label: 'Outre-mer', zone: OUTRE_MER, note: 'Guadeloupe, Martinique, Guyane, La Réunion, Mayotte' },
  { id: 'littoral', label: 'Littoral', zone: LITTORAL, note: '26 départements de métropole avec une façade maritime' },
  { id: 'sud', label: 'Sud', zone: SUD, note: 'Occitanie, Provence-Alpes-Côte d’Azur, Corse' },
  { id: 'nord', label: 'Nord', zone: NORD, note: 'Hauts-de-France, Normandie, Bretagne, Grand Est' },
  { id: 'metropoles', label: 'Grandes métropoles', zone: METROPOLES, note: '15 départements des grandes villes' },
  { id: 'idf', label: 'Île-de-France', zone: IDF, note: '8 départements' },
  { id: 'diagonale', label: 'Diagonale du vide', zone: DIAGONALE, note: 'liste indicative de 18 départements peu denses' },
  { id: 'ouest', label: 'Ouest et Centre', zone: OUEST, note: 'Bretagne, Pays de la Loire, Nouvelle-Aquitaine, Centre-Val de Loire' },
  { id: 'industriel', label: 'Bassins industriels', zone: INDUSTRIEL, note: 'Hauts-de-France, Grand Est' },
]
