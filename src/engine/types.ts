/**
 * Types du moteur « Et si… ? ».
 *
 * Indexation à plat (typed arrays) pour la performance :
 *   cellule population  = (d * SEXES + s) * AGES + a
 *   année               = y - startYear
 */

export const AGES = 101 // 0..100, la case 100 = « 100 ans et plus »
export const SEXES = 2 // 0 = hommes, 1 = femmes
export const MALE = 0
export const FEMALE = 1

/* ------------------------------------------------------------------ données brutes (JSON) */

export interface DepartmentMeta {
  code: string
  name: string
  reg: string
}

export interface RegionMeta {
  code: string
  name: string
}

export interface MetaJson {
  version: number
  startYear: number
  endYear: number
  officialHorizon: number
  departments: DepartmentMeta[]
  regions: RegionMeta[]
  status: Record<string, string>
}

export interface PopulationJson {
  year: number
  pop: number[][][] // [dep][sexe][âge]
}

export interface MortalityJson {
  years: number[]
  q: number[][][] // [sexe][annee][âge atteint dans l'année]
  depFactor: number[][] // [dep][sexe]
  e0GapObs: number[][]
}

export interface FertilityJson {
  years: number[]
  rate: number[][] // [annee][âge atteint]
  groups: [number, number][]
  depFactor: number[][] // [dep][classe]
  icf2024Model: number[]
  icf2024Obs: (number | null)[]
  boysPerGirl: number
}

export interface InternalMigrationJson {
  ageGroupWidth: number
  rate: number[][][] // [dep][sexe][classe quinquennale 0..19]
  destGroups: [number, number][]
  dest: [number, number][][][] // [classe large][origine] -> [[destination, part]]
}

export interface ExternalMigrationJson {
  years: number[]
  level: number[] // solde annuel France entière (personnes)
  profile: number[][][] // [annee][sexe][âge] somme = 1
  depWeight: number[]
  apparentNet: number[]
  internalNet: number[]
  metroShare: number
}

export interface ReferenceJson {
  national: {
    source: string
    years: number[]
    total: number[]
    share0_19: number[]
    share20_64: number[]
    share65plus: number[]
  }
  omphale: { source: string; years: number[]; pop: number[][] }
  variants?: { source: string; years: number[]; total: Record<string, number[]> }
  estimate2026: { source: string; pop: number[] }
}

export interface RawData {
  meta: MetaJson
  population: PopulationJson
  mortality: MortalityJson
  fertility: FertilityJson
  internal: InternalMigrationJson
  external: ExternalMigrationJson
  /** Superficie en km² par département (calculée sur les contours, valeur approchée). */
  areaKm2?: number[]
}

/* ------------------------------------------------------------------ données compilées */

export interface ModelData {
  nDep: number
  startYear: number
  endYear: number
  nYears: number // nombre d'états au 1er janvier (startYear..endYear inclus)
  departments: DepartmentMeta[]
  regions: RegionMeta[]
  regionIndex: Int8Array // dep -> indice de région
  /** 1 pour les départements d'outre-mer (codes 97x), 0 en métropole. */
  overseas: Uint8Array
  areaKm2: Float64Array
  pop0: Float64Array // n*2*101
  q: Float64Array // (s*Y + y)*101 + âge atteint
  mortFactor: Float64Array // d*2 + s
  fert: Float64Array // y*101 + âge atteint
  /** Indicateur conjoncturel de fécondité national de la référence, par année. */
  icfRef: Float64Array
  fertGroupOfAge: Int8Array // âge atteint -> classe (−1 hors 12..55)
  nFertGroups: number
  fertFactor: Float64Array // d*nFertGroups + g
  boysShare: number
  migRate: Float64Array // (d*2 + s)*20 + classe
  ageToBroad: Int8Array // âge -> classe large de destination
  nBroad: number
  destStart: Int32Array // (bg*n + o) -> début dans destIdx, longueur n*nBroad+1
  destIdx: Int16Array
  destShare: Float64Array
  extLevel: Float64Array // y
  extProfile: Float64Array // (y*2 + s)*101 + a
  extWeight: Float64Array // d
}

/* ------------------------------------------------------------------ scénario */

export type ZoneLevel = 'france' | 'region' | 'dep'

export interface Zone {
  level: ZoneLevel
  codes: string[] // vide pour 'france'
}

export type TimeProfile = 'step' | 'peak' | 'ramp' | 'pulse'

export type AgeRange = [number, number]

/** Effet élémentaire d'un événement. Les valeurs sont données à intensité 1. */
export type Effect =
  | { kind: 'mortality'; mult: number; ages?: AgeRange; sex?: 0 | 1 }
  /**
   * Naissances multipliées par `mult`. Avec `targetIcf`, le multiplicateur est recalculé chaque
   * année pour amener l'indicateur de fécondité national de la référence à cette cible
   * (`mult` est alors la valeur indicative au niveau de long terme).
   */
  | { kind: 'fertility'; mult: number; ages?: AgeRange; targetIcf?: number }
  /** Départs supplémentaires de la zone (fraction de la population par an), destinations habituelles. */
  | { kind: 'leave'; rate: number; ages?: AgeRange }
  /** Attractivité de la zone comme destination des migrations internes (multiplicateur). */
  | { kind: 'attract'; mult: number; ages?: AgeRange }
  /** Déménagements de la zone vers une autre zone (fraction de la population par an). */
  | { kind: 'move'; to: Zone; rate: number; ages?: AgeRange }
  /** Solde migratoire extérieur supplémentaire, en fraction de la population de la zone par an. */
  | { kind: 'external'; rate: number; ages?: AgeRange }
  /** Multiplicateur du solde migratoire extérieur national. */
  | { kind: 'externalMult'; mult: number }
  /** Âge de départ à la retraite (indicateur « pression retraites » ; aucun effet sur la population). */
  | { kind: 'retirementAge'; age: number }

export interface CascadeRule {
  /** Événement déclenché. */
  spawn: string
  /** Se déclenche après `afterYears` années actives de l'événement parent. */
  afterYears: number
  /** Intensité minimale du parent pour déclencher. */
  minIntensity: number
  delay: number
  /** Zone de l'événement dérivé : même zone, ou zone fixe. */
  zone: 'same' | Zone
  intensityFactor: number
  duration?: number
  because: string
}

export type EventFamily = 'insee' | 'sante' | 'climat' | 'economie' | 'politique' | 'societe' | 'imprevu' | 'perso'

/**
 * Niveau de preuve des effets d'un événement :
 * - insee : reproduit une variante officielle des projections Insee 2026 (vérifié par un test) ;
 * - historique : calé sur l'ampleur d'un épisode réel (vérifié par un test) ;
 * - hypothese : hypothèse de jeu, plausible mais non calée.
 */
export type Evidence = 'insee' | 'historique' | 'hypothese'

export interface EventDef {
  id: string
  name: string
  family: EventFamily
  icon: string
  summary: string
  defaults: { duration: number; intensity: number; zone: Zone }
  profile: TimeProfile
  /** L'effet reste à son niveau après la fin (ex. progrès médical). */
  persistent?: boolean
  effects: Effect[]
  cascades?: CascadeRule[]
  hypothesis: string
  source: string
  estimated: true
  /** Événement qui n'apparaît qu'en conséquence d'un autre (cascade), pas dans la bibliothèque. */
  cascadeOnly?: boolean
  /** Niveau de preuve (« hypothese » si absent). */
  evidence?: Evidence
  /** Variante Insee reproduite (code du fichier), si evidence = 'insee'. */
  inseeVariant?: string
  /** Année de départ proposée par défaut (celle de la variante officielle). */
  officialStart?: number
}

export interface ScenarioEvent {
  uid: string
  type: string // EventDef.id
  start: number
  duration: number
  intensity: number // 0..1 (peut aller jusqu'à 2 pour l'éditeur)
  zone: Zone
  /** Renseigné pour un événement déclenché par une cascade. */
  causedBy?: string
}

export interface Scenario {
  v: 1
  name: string
  seed: number
  randomness: number // 0 = déterministe, 1 = aléa fort
  events: ScenarioEvent[]
  custom: EventDef[]
}

/* ------------------------------------------------------------------ résultats */

export const COMP_BIRTHS = 0
export const COMP_DEATHS = 1
export const COMP_IN = 2 // arrivées depuis un autre département
export const COMP_OUT = 3 // départs vers un autre département
export const COMP_EXT = 4 // solde extérieur
export const N_COMP = 5

export interface SimResult {
  startYear: number
  nYears: number
  nDep: number
  /** Population au 1er janvier : (y*n + d)*2*101 + s*101 + a. */
  pop: Float32Array
  /** Composantes de l'année y (de y à y+1) : (y*n + d)*N_COMP + c. La dernière année est vide. */
  comps: Float32Array
  /** Flux nets entre départements par année (optionnel) : (y*n + o)*n + d. */
  flows?: Float32Array
  /** Événements effectivement simulés, y compris ceux issus des cascades. */
  events: ScenarioEvent[]
  /** Âge de départ à la retraite retenu chaque année (64 sans événement). */
  retirementAge: Float32Array
  /** Population négative tronquée à 0 (contrôle de cohérence, doit rester négligeable). */
  clipped: number
  elapsedMs: number
  /** Première année effectivement recalculée (les précédentes sont reprises de la référence). */
  computedFrom?: number
}
