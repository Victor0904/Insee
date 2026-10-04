import type { AgeRange, Effect, EventDef, Evidence, Zone } from '../engine/types'
import { zoneKey } from '../engine/zones'
import { EVENT_LIBRARY } from '../events/library'
import { DIAGONALE, FRANCE, IDF, LITTORAL, METROPOLES, NORD, OUEST, OUTRE_MER, SUD } from '../events/zones'
import { fmtDec1, fmtDec2, fmtSigned } from '../lib/format'

/**
 * Mode test : traduit une phrase en français en événement du moteur, sans IA ni serveur.
 *
 * L'analyse est faite de règles (mots-clés, tournures, nombres) : elle est gratuite, hors
 * ligne et toujours identique pour une même phrase. Elle ne comprend que ce qu'elle connaît :
 * tout le reste est renvoyé dans `ignored` avec une raison, jamais transformé en effet inventé.
 */

export interface ParseContext {
  departments: { code: string; name: string }[]
  regions: { code: string; name: string }[]
  startYear: number
  endYear: number
  /** Année de départ si la phrase n'en donne pas (l'année affichée). */
  defaultStart: number
}

export interface Understood {
  /** Morceau de phrase d'origine. */
  text: string
  /** Ce que le jeu en a fait, en clair. */
  explanation: string
}

export interface ParseResult {
  understood: Understood[]
  ignored: { text: string; reason: string }[]
  /** Remarques sur la traduction (approximations du modèle). */
  notes: string[]
  effects: Effect[]
  zone: Zone
  zoneLabel: string
  start: number
  duration: number
  /** Vrai si la durée vient de la phrase (sinon valeur par défaut). */
  durationGiven: boolean
  startGiven: boolean
  name: string
  /** Événement de la bibliothèque qui correspond (variante Insee, épisode calé sur l'histoire). */
  libraryMatch?: string
  /** Niveau de preuve de l'événement posé. */
  evidence: Evidence
}

/* ------------------------------------------------------------------ texte */

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Découpe en propositions (« , », « ; », « . », « et », « mais »…), en gardant le texte d'origine. */
function clauses(text: string): string[] {
  const protectedText = text.replace(/(\d{4})\s+et\s+(\d{4})/gi, '$1 à $2')
  return protectedText
    .split(/[,;:](?=\s)|[.!?](?=\s|$)|\s+(?:et|mais|puis|donc|alors|ainsi que|tandis que)\s+/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

/* ------------------------------------------------------------------ lieux */

interface Place {
  zone: Zone
  label: string
  /** Position dans la phrase normalisée. */
  at: number
  /** Mots qui précèdent (de, vers, en…). */
  before: string
  /** Nom d'habitants (« les Parisiens ») : désigne le lieu de départ. */
  demonym?: boolean
}

interface PlaceName {
  re: RegExp
  zone: Zone
  label: string
  demonym?: boolean
}

const dep = (...codes: string[]): Zone => ({ level: 'dep', codes })
const reg = (...codes: string[]): Zone => ({ level: 'region', codes })

/** Grandes villes : le département qui les contient. */
const CITIES: [string, string][] = [
  ['marseille', '13'], ['lyon', '69'], ['toulouse', '31'], ['nice', '06'], ['nantes', '44'], ['montpellier', '34'],
  ['strasbourg', '67'], ['bordeaux', '33'], ['lille', '59'], ['rennes', '35'], ['reims', '51'], ['toulon', '83'],
  ['grenoble', '38'], ['dijon', '21'], ['angers', '49'], ['brest', '29'], ['tours', '37'], ['limoges', '87'],
  ['clermont-ferrand', '63'], ['rouen', '76'], ['caen', '14'], ['nancy', '54'], ['metz', '57'], ['orleans', '45'],
  ['perpignan', '66'], ['ajaccio', '2A'], ['bastia', '2B'], ['le havre', '76'], ['saint-etienne', '42'], ['avignon', '84'],
]

/** Noms d'habitants. */
const DEMONYMS: [RegExp, Zone, string][] = [
  [/\bparisiens?\b|\bparisiennes?\b/, dep('75'), 'Paris'],
  [/\bfranciliens?\b|\bfranciliennes?\b/, IDF, 'Île-de-France'],
  [/\blyonnais(?:es)?\b/, dep('69'), 'Rhône'],
  [/\bmarseillais(?:es)?\b/, dep('13'), 'Bouches-du-Rhône'],
  [/\btoulousain(?:e|s|es)?\b/, dep('31'), 'Haute-Garonne'],
  [/\bbordelais(?:es)?\b/, dep('33'), 'Gironde'],
  [/\blillois(?:es)?\b/, dep('59'), 'Nord'],
  [/\bnantais(?:es)?\b/, dep('44'), 'Loire-Atlantique'],
  [/\bstrasbourgeois(?:es)?\b|\balsacien(?:ne)?s?\b/, dep('67', '68'), 'Alsace'],
  [/\bbretons?\b|\bbretonnes?\b/, reg('53'), 'Bretagne'],
  [/\bnormands?\b|\bnormandes?\b/, reg('28'), 'Normandie'],
  [/\bcorses?\b(?= )(?!du sud)/, reg('94'), 'Corse'],
  [/\bantillais(?:es)?\b/, dep('971', '972'), 'Antilles'],
  [/\bguadeloupeen(?:ne)?s?\b/, dep('971'), 'Guadeloupe'],
  [/\bmartiniquais(?:es)?\b/, dep('972'), 'Martinique'],
  [/\bguyanais(?:es)?\b/, dep('973'), 'Guyane'],
  [/\breunionnais(?:es)?\b/, dep('974'), 'La Réunion'],
  [/\bmahorais(?:es)?\b/, dep('976'), 'Mayotte'],
  [/\bultramarins?\b/, OUTRE_MER, 'Outre-mer'],
  [/\bcitadins?\b|\bcitadines?\b|\burbains\b/, METROPOLES, 'Grandes métropoles'],
  [/\bruraux\b/, DIAGONALE, 'Diagonale du vide'],
]

const DROM_CODES = ['971', '972', '973', '974', '976']

function placeTable(ctx: ParseContext): PlaceName[] {
  const esc = (name: string) => norm(name).replace(/[-\s]/g, '[-\\s]').replace(/'/g, "'")
  const named: { name: string; zone: Zone; label: string }[] = []
  // une région d'outre-mer n'a qu'un département : on garde le département
  const single = new Set(['01', '02', '03', '04', '06'])
  for (const r of ctx.regions) if (!single.has(r.code)) named.push({ name: r.name, zone: reg(r.code), label: r.name })
  for (const d of ctx.departments) {
    // « Nord » et « Paris » : on garde le sens courant (moitié nord, ville de Paris)
    if (d.code === '59') continue
    named.push({ name: d.name, zone: dep(d.code), label: d.name })
  }
  named.push({ name: 'departement du Nord', zone: dep('59'), label: 'Nord' })
  for (const [city, code] of CITIES) named.push({ name: city, zone: dep(code), label: city.replace(/(^|[-\s])\w/g, (c) => c.toUpperCase()) })
  // les noms longs d'abord (« Haute-Garonne » avant « Garonne », « Seine-Saint-Denis » avant « Seine »)
  named.sort((a, b) => b.name.length - a.name.length)

  const mainland = dep(...ctx.departments.map((d) => d.code).filter((c) => !DROM_CODES.includes(c)))
  return [
    ...named.map((p) => ({ re: new RegExp(`(?<![a-z])${esc(p.name)}(?![a-z])`), zone: p.zone, label: p.label })),
    ...DEMONYMS.map(([re, zone, label]) => ({ re, zone, label, demonym: true })),
    { re: /\b(?:grandes? villes?|grandes? metropoles?|metropoles|villes?|centres? urbains?|zones? urbaines?)\b/, zone: METROPOLES, label: 'Grandes métropoles' },
    // « la métropole » au singulier : la France hors outre-mer
    { re: /\b(?:metropole|hexagone|france metropolitaine)\b/, zone: mainland, label: 'Métropole' },
    { re: /\b(?:campagnes?|zones? rurales?|monde rural|rural|diagonale du vide|villages?)\b/, zone: DIAGONALE, label: 'Diagonale du vide' },
    { re: /\b(?:bord de mer|littoral|cotes?|la mer|cotier)\b/, zone: LITTORAL, label: 'Littoral' },
    { re: /\b(?:outre-mer|outre mer|dom(?:-tom)?|drom)\b/, zone: OUTRE_MER, label: 'Outre-mer' },
    { re: /\bantilles\b/, zone: dep('971', '972'), label: 'Antilles' },
    { re: /\b(?:region parisienne|ile-de-france|ile de france)\b/, zone: IDF, label: 'Île-de-France' },
    // la préposition reste hors du nom : elle dit si c'est un départ ou une destination
    { re: /\b(?:(?:le|du|au) sud|midi)\b/, zone: SUD, label: 'Sud' },
    { re: /\b(?:(?:le|du|au) nord|moitie nord)\b/, zone: NORD, label: 'Nord' },
    { re: /\bl'ouest\b/, zone: OUEST, label: 'Ouest et Centre' },
    { re: /\bfrance\b|\bpays\b/, zone: FRANCE, label: 'Toute la France' },
  ]
}

function findPlaces(n: string, table: PlaceName[]): Place[] {
  const out: Place[] = []
  const taken: [number, number][] = []
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y)
  for (const p of table) {
    for (const m of n.matchAll(new RegExp(p.re.source, 'g'))) {
      const at = m.index!
      if (!free(at, at + m[0].length)) continue
      taken.push([at, at + m[0].length])
      out.push({ zone: p.zone, label: p.label, at, before: n.slice(Math.max(0, at - 16), at), demonym: p.demonym })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

const isDestination = (p: Place) =>
  !p.demonym &&
  /(?:vers|pour|dans|rejoindre|rejoignent|s'installer|s'installent|a destination de|direction)\s+(?:la |le |les |l'|un |une |des )?$|\b(?:a|en|au|aux|sur)\s+(?:la |le |les |l')?$/.test(p.before)
const isOrigin = (p: Place) => p.demonym || /\b(?:de|du|des|d'|depuis|quittent|quitter|quitte|fuient|fuir)\s*(?:la |le |les |l')?$/.test(p.before)

/* ------------------------------------------------------------------ qui, quand, combien */

function findAges(n: string, topic: Topic): { ages?: AgeRange; sex?: 0 | 1; label?: string } {
  let m: RegExpMatchArray | null
  const sex = /\bfemmes?\b/.test(n) && topic !== 'fertility' ? 1 : /\bhommes?\b/.test(n) ? 0 : undefined
  const sexLabel = sex === 1 ? 'femmes' : sex === 0 ? 'hommes' : undefined
  const label = (s: string) => (sexLabel ? `${sexLabel}, ${s}` : s)
  if ((m = n.match(/\bde (\d{1,3}) a (\d{1,3}) ans\b|\b(\d{1,3}) ?- ?(\d{1,3}) ans\b/))) {
    const a = Number(m[1] ?? m[3])
    const b = Number(m[2] ?? m[4])
    return { ages: [Math.min(a, 100), Math.min(b, 100)], sex, label: label(`${a}-${b} ans`) }
  }
  if ((m = n.match(/\bmoins de (\d{1,3}) ans\b/))) return { ages: [0, Math.max(0, Number(m[1]) - 1)], sex, label: label(`moins de ${m[1]} ans`) }
  if ((m = n.match(/\bplus de (\d{1,3}) ans\b/))) return { ages: [Math.min(100, Number(m[1])), 100], sex, label: label(`plus de ${m[1]} ans`) }
  if (/\b(?:jeunes|etudiants|jeunes adultes|jeunesse|diplomes|cerveaux)\b/.test(n)) return { ages: [18, 34], sex, label: label('jeunes de 18 à 34 ans') }
  if (/\b(?:seniors?|personnes agees|retraites|anciens|aines|vieux|personnes ages)\b/.test(n) && topic !== 'retirement')
    return { ages: [65, 100], sex, label: label('65 ans et plus') }
  if (/\b(?:actifs|travailleurs|salaries|cadres)\b/.test(n)) return { ages: [20, 64], sex, label: label('20-64 ans') }
  if (/\b(?:familles?)\b/.test(n) && topic !== 'fertility') return { ages: [0, 49], sex, label: label('familles : 0-49 ans') }
  if (/\b(?:enfants|mineurs)\b/.test(n) && topic !== 'fertility' && !/enfants? par femme|faire des enfants/.test(n)) return { ages: [0, 17], sex, label: label('enfants') }
  if (/\b(?:nourrissons|bebes)\b/.test(n) && topic === 'mortality') return { ages: [0, 0], sex, label: label('nourrissons') }
  return { sex, label: sexLabel }
}

type Direction = 'stop' | 'down' | 'up'
type Strength = 'weak' | 'normal' | 'strong'

interface Quantity {
  dir?: Direction
  strength: Strength
  /** Facteur explicite (« double » = 2, « −20 % » = 0,8). */
  factor?: number
}

const STOP = /\b(?:plus (?:possible|autorise\w*|permis|le droit|jamais|aucun\w*|personne)|interdi\w*|impossible|ferme\w*|fermeture|stoppe\w*|arret\w*|supprim\w*|aucune?|zero|bloque\w*|n'y a plus|il n'y a plus|disparai\w*|fin de|prend fin)\b/
const DOWN =
  /\b(?:baisse\w*|diminu\w*|recul\w*|redui\w*|reduction|moins|chute\w*|effondr\w*|limit\w*|restrei\w*|restrictiv\w*|regul\w*|control\w*|durci\w*|freine?\w*|ralenti\w*|divis\w*|quota\w*|selecti\w*|satur\w*|debord\w*|manque\w*|penurie\w*|degrad\w*|gueri\w*|guerison|vainc\w*|vaincu|eradiqu\w*|soign\w*|perd\w*)\b/
const UP =
  /\b(?:hausse|augment\w*|plus de|davantage|explos\w*|boom|accueil\w*|ouvr\w*|ouverture|facilit\w*|encourag\w*|favoris\w*|multipli\w*|doubl\w*|tripl\w*|progres\w*|allong\w*|gagn\w*|remont\w*|bond\w*|record|nataliste|incit\w*|aide\w*|prime\w*|soutien\w*|amelior\w*|mieux|longtemps|arriv\w*|afflu\w*)\b/

function findQuantity(n: string): Quantity {
  const strength: Strength = /\b(?:tres|fortement|forte?s?|massi\w*|drastique\w*|radica\w*|enorme\w*|considerabl\w*|explos\w*|effondr\w*|beaucoup)\b/.test(n)
    ? 'strong'
    : /\b(?:legere?\w*|un peu|peu a peu|modere\w*|leger|faible\w*|petite?)\b/.test(n)
      ? 'weak'
      : 'normal'
  let dir: Direction | undefined
  if (STOP.test(n)) dir = 'stop'
  else if (DOWN.test(n)) dir = 'down'
  else if (UP.test(n)) dir = 'up'

  let factor: number | undefined
  const pct = n.match(/([+-]?\d+(?:[.,]\d+)?)\s*(?:%|pour ?cent)/)
  if (pct) {
    const p = Number(pct[1].replace(',', '.')) / 100
    if (pct[1].startsWith('-') || dir === 'down') factor = 1 - Math.abs(p)
    else factor = 1 + Math.abs(p)
  } else if (/\b(?:doubl\w*|deux fois plus|x ?2)\b/.test(n)) factor = 2
  else if (/\b(?:tripl\w*|trois fois plus)\b/.test(n)) factor = 3
  else if (/\b(?:moitie|divise\w* par (?:deux|2)|deux fois moins)\b/.test(n)) factor = 0.5
  if (factor !== undefined && !dir) dir = factor >= 1 ? 'up' : 'down'
  return { dir, strength, factor }
}

function findTime(n: string, ctx: ParseContext) {
  const years = [...n.matchAll(/\b(20[2-9]\d|2100)\b/g)].map((m) => Number(m[1]))
  let start: number | undefined
  let end: number | undefined
  let duration: number | undefined
  let m: RegExpMatchArray | null
  if ((m = n.match(/\b(?:de|entre)\s+(20\d\d)\s+(?:a|-)\s+(20\d\d|2100)\b/)) || (m = n.match(/\b(20\d\d)\s*-\s*(20\d\d|2100)\b/))) {
    start = Number(m[1])
    end = Number(m[2])
  } else if (years.length) {
    start = years[0]
    if ((m = n.match(/\bjusqu'?(?:en|a)\s+(20\d\d|2100)\b/))) {
      end = Number(m[1])
      if (years[0] === end) start = undefined
    }
  }
  if ((m = n.match(/\b(?:pendant|durant|pour|sur)\s+(\d{1,2})\s+ans\b/))) duration = Number(m[1])
  else if ((m = n.match(/\b(?:pendant|durant|pour|sur)\s+(?:une|un)\s+(decennie|an|annee)\b/))) duration = m[1] === 'decennie' ? 10 : 1
  const forever = /\b(?:definitiv\w*|pour toujours|a jamais|desormais|permanen\w*|durablement|pour de bon|jusqu'?a la fin du siecle|plus jamais|plus possible|n'est plus)\b/.test(n)
  const s = Math.max(ctx.startYear, Math.min(ctx.endYear - 1, start ?? ctx.defaultStart))
  if (end !== undefined) duration = Math.max(1, end - s)
  else if (duration === undefined && forever) duration = ctx.endYear - s
  // un épisode (épidémie, canicule, guerre) dure 2 ans par défaut ; une tendance ou une politique, 10 ans
  const episode = /\b(?:epidemie|pandemie|virus|grippe|canicule|vague de chaleur|guerre|famine|catastrophe|seisme|crise sanitaire)\b/.test(n)
  return {
    start: s,
    startGiven: start !== undefined,
    duration: Math.max(1, Math.min(ctx.endYear - s, duration ?? (episode ? 2 : 10))),
    durationGiven: duration !== undefined,
  }
}

/* ------------------------------------------------------------------ sujets */

type Topic = 'retirement' | 'emigration' | 'immigration' | 'fertility' | 'mortality' | 'move'

const COUNTRIES =
  'canada|quebec|etats-unis|amerique|suisse|belgique|allemagne|espagne|italie|portugal|royaume-uni|angleterre|londres|australie|asie|afrique|europe du nord|dubai|luxembourg'

const TOPICS: { topic: Topic; re: RegExp }[] = [
  { topic: 'retirement', re: /\bretraite\b.*\b\d{2}\s*ans\b|\b\d{2}\s*ans\b.*\bretraite\b|\bage (?:legal |de depart )?(?:de|a) la retraite\b|\bretraite a\b/ },
  {
    topic: 'emigration',
    re: new RegExp(
      `\\b(?:emigr\\w*|expatri\\w*|fuite des cerveaux|quitt\\w* (?:la )?france|exil\\w*|(?:partent|partir|part|vont|s'installent|s'installer|s'en vont)(?: vivre| travailler| s'installer| etudier)? (?:a|vers|pour|en|au|aux) (?:l'etranger|l'international|${COUNTRIES}))\\b`,
    ),
  },
  {
    topic: 'immigration',
    re: /\b(?:immigr\w*|etrangers?|etrangeres?|migrants?|refugies?|asile|frontieres?|visas?|titres? de sejour|regularisation\w*|sans-papiers|sans papiers|naturalis\w*|venir (?:en|vivre en|s'installer en) france|entrer en france|arriv\w* (?:de|depuis) l'etranger|solde migratoire|regroupement familial)\b/,
  },
  {
    topic: 'fertility',
    re: /\b(?:natalite|naissances?|nait|naissent|bebes?|fecondite|enfants? par femme|natalistes?|faire des enfants|font (?:moins |plus |davantage )?d'enfants|baby-?boom|familles? nombreuses?|allocations? familiales?|conges? parenta\w*|creches?|enfants?)\b/,
  },
  {
    topic: 'mortality',
    re: /\b(?:deces|mortalite|mourir|meurent|morts?|tue\w*|epidemie\w*|pandemie\w*|virus|grippe|maladie\w*|esperance de vie|longevite|progres medic\w*|cancers?|canicules?|vagues? de chaleur|guerre|famine|soins|hopita\w*|medecin\w*|sante|vivent|vivre plus|vieilli\w* mieux)\b/,
  },
  {
    topic: 'move',
    re: /\b(?:demenag\w*|s'install\w*|quitt\w*|exode\w*|fui\w*|vont vivre|partent|partir|part vivre|s'en vont|rejoign\w*|retour\w* (?:a|vers|au)|attir\w*|attracti\w*|redynamis\w*|revitalis\w*|se vide\w*|desertent|desertee?s?|desertification|repeupl\w*|teletravail\w*|arrivent|affluent|afflux|pouss\w*|chass\w*|migrent|vont vers|se deplacent)\b/,
  },
]

/** Thèmes que le modèle ne représente pas : la raison est donnée au joueur. */
const OUT_OF_MODEL: { re: RegExp; reason: string }[] = [
  {
    re: /\b(?:vot\w*|electe\w*|elections?|electora\w*|citoyen\w*|nationalit\w*|droit du sol|referendum|parti\w* politique\w*|president\w*|depute\w*)\b/,
    reason: 'Le jeu ne simule ni la nationalité ni les élections : il compte tous les habitants, quelle que soit leur nationalité.',
  },
  {
    re: /\b(?:logements?|loyers?|immobilier|maisons?|appartements?)\b/,
    reason: 'Le jeu ne simule pas le logement. On peut en revanche décrire ses effets : « les jeunes quittent Paris pour l’Ouest ».',
  },
  {
    re: /\b(?:economi\w*|pib|croissance|chomage|emplois?|salaires?|impots?|taxes?|inflation|prix|pouvoir d'achat|richesse|pauvrete|dette|budget|cher|chere|cheres|chers|cout de la vie)\b/,
    reason: 'Le jeu ne simule pas l’économie. Seules ses conséquences sur les naissances, les décès et les déménagements peuvent être réglées.',
  },
  {
    re: /\b(?:ecoles?|education|universit\w*|culture|religion\w*|securite|police|criminalit\w*|delinquance)\b/,
    reason: 'Ce thème n’est pas représenté dans le modèle, qui suit seulement les naissances, les décès et les déplacements de population.',
  },
]

/* ------------------------------------------------------------------ magnitudes */

const MAG = {
  // multiplicateur du solde migratoire national avec l'étranger
  immigration: { stop: 0, down: { weak: 0.75, normal: 0.5, strong: 0.25 }, up: { weak: 1.25, normal: 1.5, strong: 2 } },
  fertility: { stop: 0, down: { weak: 0.95, normal: 0.9, strong: 0.8 }, up: { weak: 1.05, normal: 1.1, strong: 1.2 } },
  mortality: { stop: 0.5, down: { weak: 0.95, normal: 0.9, strong: 0.8 }, up: { weak: 1.05, normal: 1.1, strong: 1.25 } },
  // fraction de la population par an
  emigration: { weak: 0.001, normal: 0.002, strong: 0.004 },
  move: { weak: 0.0015, normal: 0.003, strong: 0.006 },
  attract: { down: { weak: 0.85, normal: 0.75, strong: 0.5 }, up: { weak: 1.15, normal: 1.3, strong: 1.6 } },
}
/** Solde migratoire national de référence (projections Insee 2026), personnes par an. */
const NATIONAL_EXT = 150_000
/** Le même, en part de la population (≈ 150 000 / 68 millions). */
const NATIONAL_EXT_RATE = 0.0022
/** Indice de fécondité de référence à long terme (projections Insee 2026). */
const ICF_REF = 1.45
/** Un an d'espérance de vie en plus ≈ 10 % de risque de décès en moins à chaque âge (loi de Gompertz). */
const GOMPERTZ = 0.1

const multFor = (t: 'immigration' | 'fertility' | 'mortality', q: Quantity, dir: Direction) => {
  if (q.factor !== undefined) return q.factor
  const m = MAG[t]
  return dir === 'stop' ? m.stop : m[dir][q.strength]
}

const pct = (m: number) => `${fmtSigned(Math.round((m - 1) * 100))} %`
const rate = (r: number) => `${fmtDec1(r * 100).replace(/,0$/, '')} %`
const num = (s: string) => Number(s.replace(/[\s.]/g, '').replace(',', '.'))

/** Événements de la bibliothèque réutilisés quand la phrase les décrit sans chiffre. */
const LIBRARY_HINTS: { re: RegExp; id: string }[] = [
  { re: /\b(?:canicules?|vagues? de chaleur)\b.*\b(?:frequent\w*|repet\w*|chaque (?:ete|annee)|tous les (?:ans|etes|\d+ ans)|regulier\w*|multipli\w*)\b|\bcanicules\b/, id: 'canicules-repetees' },
  { re: /\b(?:canicule|vague de chaleur)\b/, id: 'canicule' },
  { re: /\b(?:pandemie|epidemie|virus|grippe|crise sanitaire)\b/, id: 'pandemie' },
]

/* ------------------------------------------------------------------ analyse */

export function parseEvent(text: string, ctx: ParseContext): ParseResult {
  const table = placeTable(ctx)
  const whole = norm(text)
  const time = findTime(whole, ctx)
  const understood: Understood[] = []
  const ignored: { text: string; reason: string }[] = []
  const notes: string[] = []
  const effects: Effect[] = []
  /** Explication de chaque effet, et si sa valeur vient d'un chiffre de la phrase (même indice). */
  const explained: Understood[] = []
  const explicit: boolean[] = []
  const emit = (e: Effect, u: Understood, isExplicit = false) => {
    effects.push(e)
    explained.push(u)
    explicit.push(isExplicit)
  }
  const usedAsTarget = new Set<string>()
  let hint: string | undefined
  let immigrationStop = false

  const parts = clauses(text).map((raw) => {
    // « à partir de 2030 » n'est pas un départ
    const n = norm(raw).replace(/\ba partir (?:de|du|d')/g, 'des')
    let topics = TOPICS.filter((t) => t.re.test(n)).map((t) => t.topic)
    const drop = (t: Topic) => (topics = topics.filter((x) => x !== t))
    // l'émigration n'est ni un déménagement interne ni de l'immigration
    if (topics.includes('emigration')) {
      drop('move')
      drop('immigration')
    }
    // « venir en France » n'est pas un déménagement
    if (topics.includes('immigration') && !findPlaces(n, table).some((pl) => pl.zone.level !== 'france')) drop('move')
    // « les étrangers ne peuvent plus voter » parle du vote, pas de l'immigration
    if (topics.includes('immigration') && OUT_OF_MODEL[0].re.test(n) && !/immigr|frontiere|venir|entrer|arriv|asile|visa|quota|migrant|refugie|accueil/.test(n)) drop('immigration')
    // « les enfants » seuls désignent un public, pas les naissances
    if (topics.length > 1 && !/naissan|nait|natal|fecond|bebe|par femme|faire des enfants|d'enfants|baby|nombreuse|allocation|conge|creche/.test(n)) drop('fertility')
    // « des enfants naissent » : naissances, pas décès
    if (topics.includes('fertility') && topics.includes('mortality') && !/deces|mortal|mourir|meurent|mort|tue|epidem|pandem|virus|maladie/.test(n)) drop('mortality')
    return { raw, n, topics, q: findQuantity(n) }
  })

  // une proposition sans verbe de sens hérite du sens de sa voisine (« les naissances et les décès
  // augmentent »), sauf si la voisine parle du même sujet : elle porte alors son propre effet
  parts.forEach((p, i) => {
    if (p.topics.length && !p.q.dir) {
      const near = (x: (typeof parts)[number]) => x.q.dir && !x.topics.some((t) => p.topics.includes(t))
      const next = parts.slice(i + 1).find(near) ?? parts.slice(0, i).reverse().find(near)
      if (next) p.q = { ...next.q, factor: p.q.factor ?? next.q.factor }
    }
  })

  const allPlaces = findPlaces(whole, table)

  for (const p of parts) {
    const { raw, n, q } = p
    if (!p.topics.length) {
      const out = OUT_OF_MODEL.find((o) => o.re.test(n))
      const onlyContext = /\b(?:20[2-9]\d|2100|ans?|pendant|durant|des|jusqu|definitiv|desormais)\b/.test(n) || findPlaces(n, table).length > 0
      if (out) ignored.push({ text: raw, reason: out.reason })
      else if (!onlyContext && n.split(' ').length > 1) ignored.push({ text: raw, reason: 'Je n’ai reconnu ici ni naissances, ni décès, ni migrations, ni déménagements.' })
      continue
    }
    const outHere = OUT_OF_MODEL.find((o) => o.re.test(n))
    if (outHere && (/\bvot\w*|elect\w*|citoyen\w*/.test(n) || !p.topics.length)) ignored.push({ text: raw, reason: outHere.reason })

    for (const topic of p.topics) {
      const who = findAges(n, topic)
      const whoText = who.label ? ` (${who.label})` : ''
      const dir: Direction | undefined = q.dir
      const unclear = (what: string) =>
        ignored.push({ text: raw, reason: `Je n’ai pas compris si ${what} augmente ou baisse. Ajoutez par exemple « augmente », « baisse de 20 % » ou « double ».` })

      if (topic === 'retirement') {
        const m = n.match(/\b(\d{2})\s*ans\b/)
        const age = m ? Math.max(55, Math.min(75, Number(m[1]))) : undefined
        if (age === undefined) {
          ignored.push({ text: raw, reason: 'Précisez l’âge de départ à la retraite (par exemple « retraite à 67 ans »).' })
          continue
        }
        emit({ kind: 'retirementAge', age }, { text: raw, explanation: `Âge de départ à la retraite : ${age} ans. Cela change l’indicateur « pression retraites », pas la population.` }, true)
        continue
      }

      if (topic === 'immigration') {
        // un nombre de personnes par an : « 300 000 immigrés par an »
        const abs = n.match(/(\d{1,3}(?:[\s.]\d{3})+|\d{4,7})\s*(?:personnes|immigres|immigrants|migrants|etrangers|arrivees|entrees|refugies)?\s*(?:par an|chaque annee|par annee)/)
        if (!dir && !abs) {
          unclear('l’immigration')
          continue
        }
        let m = abs ? num(abs[1]) / NATIONAL_EXT : multFor('immigration', q, dir!)
        m = Math.max(0, Math.min(4, m))
        if (dir === 'stop' && !abs) immigrationStop = true
        const local = allPlaces.find((pl) => pl.zone.level !== 'france')
        if (local) {
          const r = -(1 - m) * NATIONAL_EXT_RATE
          emit(
            { kind: 'external', rate: r, ages: who.ages },
            { text: raw, explanation: `Solde avec l’étranger dans la zone : ${fmtSigned(r * 100, fmtDec1)} % d’habitants par an par rapport à la référence${whoText}.` },
            !!abs || q.factor !== undefined,
          )
        } else {
          emit(
            { kind: 'externalMult', mult: m },
            {
              text: raw,
              explanation:
                m === 0
                  ? 'Solde migratoire avec l’étranger ramené à zéro : autant de départs que d’arrivées, au lieu d’environ +150 000 personnes par an.'
                  : `Solde migratoire avec l’étranger ${m < 1 ? 'réduit' : 'augmenté'} de ${pct(m).replace(/^[+−]\s?/, '')} : environ ${fmtSigned(NATIONAL_EXT * m)} personnes par an au lieu de +150 000.`,
            },
            !!abs || q.factor !== undefined,
          )
        }
        if (abs) notes.push('Le jeu lit ce nombre comme le solde avec l’étranger (arrivées moins départs).')
        if (dir === 'stop' || m < 0.3)
          notes.push('Le jeu suit le solde avec l’étranger (arrivées moins départs), pas les arrivées seules. « Plus personne ne vient » est traduit par un solde nul. En réalité, les départs continuant, il deviendrait négatif.')
        continue
      }

      if (topic === 'emigration') {
        const less = dir === 'down' || dir === 'stop'
        const r = (less ? 1 : -1) * MAG.emigration[q.strength]
        emit(
          { kind: 'external', rate: r, ages: who.ages ?? (/cerveaux|diplome|jeunes/.test(n) ? [18, 34] : undefined) },
          { text: raw, explanation: `${less ? 'Moins de départs' : 'Départs supplémentaires'} vers l’étranger : ${rate(Math.abs(r))} des habitants${whoText} par an.` },
        )
        continue
      }

      if (topic === 'fertility') {
        const icf = n.match(/(\d(?:[.,]\d+)?)\s*enfants? par femme/)
        if (!icf && !dir) {
          unclear('le nombre de naissances')
          continue
        }
        let m = icf ? num(icf[1]) / ICF_REF : multFor('fertility', q, dir!)
        m = Math.max(0, Math.min(2.5, m))
        emit(
          { kind: 'fertility', mult: m },
          {
            text: raw,
            explanation: icf
              ? `${icf[1].replace('.', ',')} enfants par femme au lieu de ${fmtDec2(ICF_REF)} dans la référence à long terme : naissances ${pct(m)}.`
              : `Naissances ${pct(m)}.`,
          },
          !!icf || q.factor !== undefined,
        )
        continue
      }

      if (topic === 'mortality') {
        const disease = /epidemi|pandemi|virus|grippe|maladie|cancer|crise sanitaire|canicule|chaleur|guerre|famine|tue/.test(n)
        // l'espérance de vie, la santé et les soins vont dans l'autre sens que les décès
        const inverse = /esperance de vie|longevite|progres medic|soins|hopita|medecin|sante|vivent|vivre plus|vieilli\w* mieux/.test(n) && !/epidemi|pandemi|virus|crise sanitaire/.test(n)
        // années d'espérance de vie : « vivent 5 ans de plus », « l'espérance de vie gagne 3 ans »
        const years = inverse
          ? n.match(/(\d+(?:[.,]\d+)?)\s*ans? de (plus|moins)|(?:gagn\w*|perd\w*|augment\w*|progress\w*|recul\w*|baiss\w*|diminu\w*)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*ans?\b/)
          : null
        if (years) {
          const gain = years[2] ? years[2] === 'plus' : !/perd|recul|baiss|diminu/.test(years[0])
          const y = num(years[1] ?? years[3])
          const m = Math.max(0.3, Math.min(3, Math.exp((gain ? -1 : 1) * GOMPERTZ * y)))
          emit(
            { kind: 'mortality', mult: m, ages: who.ages, sex: who.sex },
            {
              text: raw,
              explanation: `Espérance de vie ${gain ? '+' : '−'} ${String(y).replace('.', ',')} an${y >= 2 ? 's' : ''} environ : risque de décès ${pct(m)} à chaque âge${whoText}.`,
            },
            true,
          )
          notes.push('Règle utilisée : un an d’espérance de vie en plus correspond à environ 10 % de risque de décès en moins à chaque âge.')
          continue
        }
        if (!dir && !disease) {
          unclear('le nombre de décès')
          continue
        }
        let d: Direction = dir ?? 'up'
        if (inverse) d = d === 'up' ? 'down' : 'up'
        const m = Math.max(0.3, Math.min(3, multFor('mortality', { ...q, factor: inverse && q.factor ? 2 - q.factor : q.factor }, d)))
        emit({ kind: 'mortality', mult: m, ages: who.ages, sex: who.sex }, { text: raw, explanation: `Décès ${pct(m)}${whoText}.` }, q.factor !== undefined)
        if (q.factor === undefined && !who.ages && !inverse && d === 'up') hint ??= LIBRARY_HINTS.find((h) => h.re.test(n))?.id
        continue
      }

      if (topic === 'move') {
        let here = findPlaces(n, table).filter((pl) => pl.zone.level !== 'france')
        // « la vie devient chère en Île-de-France et les familles partent » : le lieu, cité dans
        // l'autre proposition, est celui qu'on quitte
        if (!here.length && !/exode|teletravail/.test(n)) here = allPlaces.filter((pl) => pl.zone.level !== 'france').map((pl) => ({ ...pl, demonym: true }))
        let dest = here.find(isDestination)
        let origin = here.find((pl) => pl !== dest && isOrigin(pl)) ?? here.find((pl) => pl !== dest)
        const repopulate = /attir|attracti|redynamis|revitalis|repeupl|arrivent|affluent|afflux/.test(n)
        if (repopulate && origin && !dest) {
          dest = origin
          origin = undefined
        }
        if (/exode urbain|quitt\w* (?:les )?villes/.test(n) && !origin) origin = { zone: METROPOLES, label: 'Grandes métropoles', at: 0, before: '' }
        if (/exode urbain|teletravail/.test(n) && !dest && !here.length) dest = { zone: DIAGONALE, label: 'Diagonale du vide', at: 0, before: '' }
        if (/exode rural/.test(n) && !origin) origin = { zone: DIAGONALE, label: 'Diagonale du vide', at: 0, before: '' }
        const ages = who.ages ?? [18, 64]
        const agesText = who.label ? ` (${who.label})` : ' (18-64 ans)'
        if (origin && dest && zoneKey(origin.zone) !== zoneKey(dest.zone)) {
          const r = MAG.move[q.strength] * (q.factor && q.factor > 1 ? q.factor : 1)
          usedAsTarget.add(zoneKey(origin.zone))
          emit({ kind: 'move', to: dest.zone, rate: r, ages }, { text: raw, explanation: `Chaque année, ${rate(r)} des habitants${agesText} de « ${origin.label} » partent vers « ${dest.label} ».` })
        } else if (dest) {
          const less = (dir === 'down' || dir === 'stop') && /attir|attracti/.test(n)
          const m = less ? MAG.attract.down[q.strength] : MAG.attract.up[q.strength]
          usedAsTarget.add(zoneKey(dest.zone))
          emit(
            { kind: 'attract', mult: m, ages },
            {
              text: raw,
              explanation: less
                ? `« ${dest.label} » attire ${pct(m).replace(/^[+−]\s?/, '')} de nouveaux arrivants en moins${agesText}.`
                : `« ${dest.label} » attire ${pct(m)} de nouveaux arrivants venus du reste de la France${agesText}.`,
            },
          )
        } else if (origin) {
          const r = MAG.move[q.strength]
          usedAsTarget.add(zoneKey(origin.zone))
          emit({ kind: 'leave', rate: r, ages }, { text: raw, explanation: `Chaque année, ${rate(r)} des habitants${agesText} de « ${origin.label} » partent ailleurs en France.` })
        } else {
          ignored.push({ text: raw, reason: 'Je n’ai pas trouvé de lieu : dites d’où les gens partent ou vers où (« les jeunes quittent Paris pour la Bretagne »).' })
        }
        continue
      }
    }
  }

  // zone de l'événement : celle des déménagements, sinon le premier lieu cité
  const moveZone = [...usedAsTarget][0]
  const zonePlace = moveZone ? allPlaces.find((pl) => zoneKey(pl.zone) === moveZone) : allPlaces.find((pl) => pl.zone.level !== 'france')
  const zone = moveZone && !zonePlace ? zoneFromKey(moveZone) : (zonePlace?.zone ?? FRANCE)
  const zoneLabel = zone.level === 'france' ? 'Toute la France' : (zonePlace?.label ?? namedLabel(zone, table))

  const { merged, why } = mergeEffects(effects, explained, explicit)
  understood.unshift(...why)

  // événement de la bibliothèque quand la phrase le décrit exactement
  let libraryMatch: string | undefined
  if (merged.length === 1 && merged[0].kind === 'externalMult' && merged[0].mult === 0 && zone.level === 'france') libraryMatch = 'insee-solde-nul'
  else if (merged.length === 1 && merged[0].kind === 'mortality' && hint) libraryMatch = hint
  const libDef = libraryMatch ? EVENT_LIBRARY.find((e) => e.id === libraryMatch) : undefined
  let duration = time.duration
  if (immigrationStop && !time.durationGiven) duration = ctx.endYear - time.start
  if (libDef) {
    if (libDef.evidence === 'insee') {
      notes.unshift(`C’est exactement la variante officielle « ${libDef.name.replace(/ \(Insee\)$/, '').toLowerCase()} » de l’Insee : le jeu utilise l’événement de la bibliothèque, dont l’effet est vérifié.`)
    } else {
      understood.splice(0, understood.length, { text: why.map((w) => w.text).join(' ; '), explanation: `Événement « ${libDef.name} » de la bibliothèque : ${libDef.summary}` })
      notes.unshift(`Sans chiffre précis, le jeu utilise l’événement « ${libDef.name} », ${libDef.evidence === 'historique' ? 'calé sur un épisode réel' : 'déjà réglé'} : ${libDef.hypothesis}`)
      if (!time.durationGiven) duration = libDef.defaults.duration
    }
  }

  return {
    understood,
    ignored,
    notes: [...new Set(notes)],
    effects: libDef && libDef.evidence !== 'insee' ? libDef.effects : merged,
    zone,
    zoneLabel,
    start: time.start,
    duration: Math.max(1, Math.min(ctx.endYear - time.start, duration)),
    durationGiven: time.durationGiven,
    startGiven: time.startGiven,
    name: shortName(text),
    libraryMatch,
    evidence: libDef?.evidence ?? 'hypothese',
  }
}

function zoneFromKey(key: string): Zone {
  for (const z of [METROPOLES, DIAGONALE, LITTORAL, OUTRE_MER, IDF, SUD, NORD, OUEST]) if (zoneKey(z) === key) return z
  return FRANCE
}

function namedLabel(zone: Zone, table: PlaceName[]) {
  const k = zoneKey(zone)
  return table.find((n) => zoneKey(n.zone) === k)?.label ?? 'Zone choisie'
}

/**
 * Fusionne les effets redondants : un même effet (même type, même public) cité deux fois n'en fait
 * qu'un. On garde la valeur donnée en chiffres par la phrase, sinon la plus forte. Les explications
 * suivent leur effet.
 */
function mergeEffects(effects: Effect[], explained: Understood[], explicit: boolean[]) {
  const merged: Effect[] = []
  const why: Understood[] = []
  const exp: boolean[] = []
  const key = (e: Effect) => {
    const { kind } = e
    const ages = 'ages' in e ? e.ages : undefined
    const sex = 'sex' in e ? e.sex : undefined
    const to = 'to' in e ? zoneKey(e.to) : undefined
    return JSON.stringify([kind, ages, sex, to])
  }
  const strength = (e: Effect) => ('mult' in e ? Math.abs(e.mult - 1) : 'rate' in e ? Math.abs(e.rate) : 0)
  effects.forEach((e, k) => {
    const i = merged.findIndex((o) => key(o) === key(e))
    if (i < 0) {
      merged.push(e)
      why.push(explained[k])
      exp.push(explicit[k])
      return
    }
    const text = why[i].text === explained[k].text ? why[i].text : `${why[i].text} ; ${explained[k].text}`
    const replace = explicit[k] !== exp[i] ? explicit[k] : e.kind === 'retirementAge' || strength(e) > strength(merged[i])
    if (replace) {
      merged[i] = e
      exp[i] = explicit[k]
      why[i] = { text, explanation: explained[k].explanation }
    } else why[i] = { ...why[i], text }
  })
  return { merged, why }
}

function shortName(s: string) {
  const t = s.trim().replace(/^[a-zà-ÿ]/i, (c) => c.toUpperCase())
  if (t.length <= 40) return t
  const cut = t.slice(0, 39)
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 39) + '…'
}

/** Définition d'événement prête à poser, à partir de l'analyse. */
export function toEventDef(r: ParseResult, id: string, original: string): EventDef {
  const lines = r.understood.map((u) => u.explanation)
  return {
    id,
    name: r.name,
    family: 'perso',
    icon: 'custom',
    summary: lines.join(' ') || 'Aucun effet.',
    defaults: { duration: r.duration, intensity: 1, zone: r.zone },
    profile: 'step',
    effects: r.effects,
    hypothesis: `Traduit automatiquement de la phrase : « ${original.trim()} ». ${r.notes.join(' ')}`.trim(),
    source: 'Hypothèse du joueur, traduite par le mode test (règles, sans IA).',
    estimated: true,
    evidence: 'hypothese',
  }
}

/** Phrases d'exemple affichées sous le champ (et testées). */
export const EXAMPLES = [
  'L’immigration devient très régulée et il n’est plus possible pour un étranger de venir en France et de voter',
  'À partir de 2030, les naissances augmentent de 20 % grâce à une politique nataliste',
  'Les Parisiens partent s’installer à Bordeaux pendant 15 ans',
  'Une épidémie frappe fortement les personnes âgées en 2035',
  'Les femmes vivent 3 ans de plus',
  'On accueille 300 000 immigrés par an dès 2030',
]

