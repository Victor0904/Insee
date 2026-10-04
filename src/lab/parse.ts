import type { AgeRange, Effect, EventDef, Zone } from '../engine/types'
import { zoneKey } from '../engine/zones'
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
  /** Événement de la bibliothèque qui correspond exactement (ex. variante Insee). */
  libraryMatch?: string
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
  /** Mot qui précède (de, vers, en…). */
  before: string
}

const NAMED: { re: RegExp; zone: Zone; label: string }[] = [
  { re: /\b(?:grandes? villes?|villes?|metropoles?|centres? urbains?|zones? urbaines?)\b/, zone: METROPOLES, label: 'Grandes métropoles' },
  { re: /\b(?:campagnes?|zones? rurales?|monde rural|rural|diagonale du vide|villages?)\b/, zone: DIAGONALE, label: 'Diagonale du vide' },
  { re: /\b(?:bord de mer|littoral|cotes?|la mer|cotier)\b/, zone: LITTORAL, label: 'Littoral' },
  { re: /\b(?:outre-mer|outre mer|dom(?:-tom)?|drom|antilles)\b/, zone: OUTRE_MER, label: 'Outre-mer' },
  { re: /\b(?:region parisienne|ile-de-france|ile de france)\b/, zone: IDF, label: 'Île-de-France' },
  { re: /\b(?:le sud|du sud|au sud|vers le sud|midi)\b/, zone: SUD, label: 'Sud' },
  { re: /\b(?:le nord|du nord|au nord|vers le nord|moitie nord)\b/, zone: NORD, label: 'Nord' },
  { re: /\b(?:l'ouest|de l'ouest|a l'ouest|vers l'ouest)\b/, zone: OUEST, label: 'Ouest et Centre' },
  { re: /\bfrance\b|\bpays\b/, zone: FRANCE, label: 'Toute la France' },
]

function placeTable(ctx: ParseContext) {
  const table: { name: string; zone: Zone; label: string }[] = []
  // une région d'outre-mer n'a qu'un département : on garde le département
  const single = new Set(['01', '02', '03', '04', '06'])
  for (const r of ctx.regions) if (!single.has(r.code)) table.push({ name: norm(r.name), zone: { level: 'region', codes: [r.code] }, label: r.name })
  for (const d of ctx.departments) {
    // « Nord » et « Paris » : on garde le sens courant (moitié nord, ville de Paris)
    if (d.code === '59') continue
    table.push({ name: norm(d.name), zone: { level: 'dep', codes: [d.code] }, label: d.name })
  }
  table.push({ name: 'paris', zone: { level: 'dep', codes: ['75'] }, label: 'Paris' })
  table.push({ name: 'departement du nord', zone: { level: 'dep', codes: ['59'] }, label: 'Nord' })
  // les noms longs d'abord (« Haute-Garonne » avant « Garonne », « Seine-Saint-Denis » avant « Seine »)
  return table.sort((a, b) => b.name.length - a.name.length)
}

function findPlaces(n: string, table: ReturnType<typeof placeTable>): Place[] {
  const out: Place[] = []
  const taken: [number, number][] = []
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y)
  const push = (at: number, len: number, zone: Zone, label: string) => {
    if (!free(at, at + len)) return
    taken.push([at, at + len])
    const before = n.slice(Math.max(0, at - 14), at)
    out.push({ zone, label, at, before })
  }
  for (const p of table) {
    const re = new RegExp(`(?<![a-z])${p.name.replace(/[-\s]/g, '[-\\s]')}(?![a-z])`, 'g')
    for (const m of n.matchAll(re)) push(m.index!, m[0].length, p.zone, p.label)
  }
  for (const p of NAMED) {
    const re = new RegExp(p.re.source, 'g')
    for (const m of n.matchAll(re)) push(m.index!, m[0].length, p.zone, p.label)
  }
  return out.sort((a, b) => a.at - b.at)
}

const isDestination = (p: Place) => /(?:vers|pour|dans|rejoindre|rejoignent|s'installer|s'installent|a destination de|direction)\s+(?:la |le |les |l'|un |une |des )?$|\b(?:a|en|au|aux|sur)\s+(?:la |le |les |l')?$/.test(p.before)
const isOrigin = (p: Place) => /\b(?:de|du|des|d'|depuis|quittent|quitter|quitte|fuient|fuir)\s*(?:la |le |les |l')?$/.test(p.before)

/* ------------------------------------------------------------------ qui, quand, combien */

function findAges(n: string, topic: Topic): { ages?: AgeRange; sex?: 0 | 1; label?: string } {
  let m: RegExpMatchArray | null
  const sex = /\bfemmes?\b/.test(n) && topic !== 'fertility' ? 1 : /\bhommes?\b/.test(n) ? 0 : undefined
  const sexLabel = sex === 1 ? 'femmes' : sex === 0 ? 'hommes' : undefined
  if ((m = n.match(/\bde (\d{1,3}) a (\d{1,3}) ans\b|\b(\d{1,3}) ?- ?(\d{1,3}) ans\b/))) {
    const a = Number(m[1] ?? m[3]), b = Number(m[2] ?? m[4])
    return { ages: [Math.min(a, 100), Math.min(b, 100)], sex, label: `${a}-${b} ans` }
  }
  if ((m = n.match(/\bmoins de (\d{1,3}) ans\b/))) return { ages: [0, Math.max(0, Number(m[1]) - 1)], sex, label: `moins de ${m[1]} ans` }
  if ((m = n.match(/\bplus de (\d{1,3}) ans\b/))) return { ages: [Math.min(100, Number(m[1])), 100], sex, label: `plus de ${m[1]} ans` }
  if (/\b(?:jeunes|etudiants|jeunes adultes|jeunesse|diplomes|cerveaux)\b/.test(n)) return { ages: [18, 34], sex, label: 'jeunes de 18 à 34 ans' }
  if (/\b(?:seniors?|personnes agees|retraites|anciens|aines|vieux|personnes ages)\b/.test(n) && topic !== 'retirement')
    return { ages: [65, 100], sex, label: '65 ans et plus' }
  if (/\b(?:actifs|travailleurs|salaries|cadres)\b/.test(n)) return { ages: [20, 64], sex, label: '20-64 ans' }
  if (/\b(?:familles?)\b/.test(n) && topic !== 'fertility') return { ages: [0, 49], sex, label: 'familles (0-49 ans)' }
  if (/\b(?:enfants|mineurs)\b/.test(n) && topic !== 'fertility' && !/enfants? par femme|faire des enfants/.test(n)) return { ages: [0, 17], sex, label: 'enfants' }
  if (/\b(?:nourrissons|bebes)\b/.test(n) && topic === 'mortality') return { ages: [0, 0], sex, label: 'nourrissons' }
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

function findQuantity(n: string): Quantity {
  const strength: Strength = /\b(?:tres|fortement|forte?s?|massi\w*|drastique\w*|radica\w*|enorme\w*|considerabl\w*|explos\w*|effondr\w*|beaucoup)\b/.test(n)
    ? 'strong'
    : /\b(?:legere?\w*|un peu|peu a peu|modere\w*|leger|faible\w*|petite?)\b/.test(n)
      ? 'weak'
      : 'normal'
  let dir: Direction | undefined
  if (/\b(?:plus (?:possible|autorise\w*|permis|le droit|jamais|aucun\w*|personne)|interdi\w*|impossible|ferme\w*|fermeture|stoppe\w*|arret\w*|supprim\w*|aucune?|zero|bloque\w*|n'y a plus|il n'y a plus|disparai\w*|fin de|prend fin)\b/.test(n)) dir = 'stop'
  else if (/\b(?:baisse\w*|diminu\w*|recul\w*|redui\w*|reduction|moins|chute\w*|effondr\w*|limit\w*|restrei\w*|restrictiv\w*|regul\w*|control\w*|durci\w*|freine?\w*|ralenti\w*|divis\w*|quota\w*|selecti\w*)\b/.test(n)) dir = 'down'
  else if (/\b(?:hausse|augment\w*|plus de|davantage|explos\w*|boom|accueil\w*|ouvr\w*|ouverture|facilit\w*|encourag\w*|favoris\w*|multipli\w*|doubl\w*|tripl\w*|progres\w*|allong\w*|gagn\w*|remont\w*|bond\w*|record|nataliste|incit\w*|aide\w*|prime\w*|soutien\w*)\b/.test(n)) dir = 'up'

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
  if ((m = n.match(/\b(?:pendant|durant|pour|sur|en)\s+(\d{1,2})\s+ans\b/))) duration = Number(m[1])
  else if ((m = n.match(/\b(?:pendant|durant|pour|sur)\s+(?:une|un)\s+(decennie|an|annee)\b/))) duration = m[1] === 'decennie' ? 10 : 1
  const forever = /\b(?:definitiv\w*|pour toujours|a jamais|desormais|permanen\w*|durablement|pour de bon|jusqu'?a la fin du siecle|plus jamais|plus possible|n'est plus)\b/.test(n)
  const s = Math.max(ctx.startYear, Math.min(ctx.endYear - 1, start ?? ctx.defaultStart))
  if (end !== undefined) duration = Math.max(1, end - s)
  else if (duration === undefined && forever) duration = ctx.endYear - s
  // un épisode (épidémie, canicule, guerre) dure 2 ans par défaut ; une tendance ou une politique, 10 ans
  const episode = /\b(?:epidemie|pandemie|virus|grippe|canicule|vague de chaleur|guerre|famine|catastrophe|seisme|crise)\b/.test(n)
  return { start: s, startGiven: start !== undefined, duration: Math.max(1, Math.min(ctx.endYear - s, duration ?? (episode ? 2 : 10))), durationGiven: duration !== undefined }
}

/* ------------------------------------------------------------------ sujets */

type Topic = 'retirement' | 'emigration' | 'immigration' | 'fertility' | 'mortality' | 'move'

const TOPICS: { topic: Topic; re: RegExp }[] = [
  { topic: 'retirement', re: /\bretraite\b.*\b\d{2}\s*ans\b|\b\d{2}\s*ans\b.*\bretraite\b|\bage (?:legal |de depart )?(?:de|a) la retraite\b|\bretraite a\b/ },
  { topic: 'emigration', re: /\b(?:emigr\w*|expatri\w*|fuite des cerveaux|quitt\w* (?:la )?france|(?:partent|partir|part|s'installent|s'installer|vont vivre|vont travailler) (?:a|vers|pour) l'etranger|exil\w*)\b/ },
  { topic: 'immigration', re: /\b(?:immigr\w*|etrangers?|etrangeres?|migrants?|refugies?|asile|frontieres?|visas?|titres? de sejour|regularisation\w*|sans-papiers|sans papiers|naturalis\w*|venir (?:en|vivre en|s'installer en) france|arriv\w* (?:de|depuis) l'etranger|solde migratoire|regroupement familial)\b/ },
  { topic: 'fertility', re: /\b(?:natalite|naissances?|bebes?|fecondite|enfants? par femme|natalistes?|faire des enfants|baby-?boom|familles? nombreuses?|allocations? familiales?|conges? parenta\w*|creches?|enfants?)\b/ },
  { topic: 'mortality', re: /\b(?:deces|mortalite|mourir|meurent|morts?|epidemie\w*|pandemie\w*|virus|grippe|maladie\w*|esperance de vie|longevite|progres medic\w*|cancers?|canicules?|vagues? de chaleur|guerre|famine|soins|hopita\w*|medecin\w*|sante)\b/ },
  {
    topic: 'move',
    re: /\b(?:demenag\w*|s'install\w*|quitt\w*|exode\w*|fui\w*|vont vivre|partent|partir|part vivre|s'en vont|rejoign\w*|retour\w* (?:a|vers|au)|attir\w*|attracti\w*|redynamis\w*|revitalis\w*|se vide\w*|desert\w*|repeupl\w*|teletravail\w*|arrivent|affluent|afflux)\b/,
  },
]

/** Thèmes que le modèle ne représente pas : la raison est donnée au joueur. */
const OUT_OF_MODEL: { re: RegExp; reason: string }[] = [
  {
    re: /\b(?:vot\w*|electe\w*|elections?|electora\w*|citoyen\w*|nationalit\w*|droit du sol|referendum|parti\w* politique\w*|president\w*|depute\w*)\b/,
    reason: 'Le jeu ne simule ni la nationalité ni les élections : il compte tous les habitants, quelle que soit leur nationalité.',
  },
  {
    re: /\b(?:economi\w*|pib|croissance|chomage|emplois?|salaires?|impots?|taxes?|inflation|prix|pouvoir d'achat|richesse|pauvrete|dette|budget)\b/,
    reason: 'Le jeu ne simule pas l’économie. Seules ses conséquences sur les naissances, les décès et les déménagements peuvent être réglées.',
  },
  {
    re: /\b(?:logements?|loyers?|immobilier|maisons?|appartements?)\b/,
    reason: 'Le jeu ne simule pas le logement. On peut en revanche décrire ses effets : « les jeunes quittent Paris pour l’Ouest ».',
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
  fertility: { stop: 0.5, down: { weak: 0.95, normal: 0.9, strong: 0.8 }, up: { weak: 1.05, normal: 1.1, strong: 1.2 } },
  mortality: { stop: 0.5, down: { weak: 0.95, normal: 0.9, strong: 0.8 }, up: { weak: 1.05, normal: 1.1, strong: 1.25 } },
  // fraction de la population par an
  emigration: { weak: 0.001, normal: 0.002, strong: 0.004 },
  move: { weak: 0.0015, normal: 0.003, strong: 0.006 },
  attract: { down: { weak: 0.85, normal: 0.75, strong: 0.5 }, up: { weak: 1.15, normal: 1.3, strong: 1.6 } },
}
/** Solde migratoire national de référence ≈ 150 000 / 68 millions par an. */
const NATIONAL_EXT_RATE = 0.0022
/** Indice de fécondité de référence à long terme (projections Insee 2026). */
const ICF_REF = 1.45

const multFor = (t: 'immigration' | 'fertility' | 'mortality', q: Quantity, dir: Direction) => {
  if (q.factor !== undefined) return q.factor
  const m = MAG[t]
  return dir === 'stop' ? m.stop : m[dir][q.strength]
}

const pct = (m: number) => `${fmtSigned(Math.round((m - 1) * 100))} %`
const rate = (r: number) => `${fmtDec1(r * 100).replace(/,0$/, '')} %`

/* ------------------------------------------------------------------ analyse */

export function parseEvent(text: string, ctx: ParseContext): ParseResult {
  const table = placeTable(ctx)
  const whole = norm(text)
  const time = findTime(whole, ctx)
  const understood: Understood[] = []
  const ignored: { text: string; reason: string }[] = []
  const notes: string[] = []
  const effects: Effect[] = []
  /** Explication de chaque effet (même indice que `effects`). */
  const explained: Understood[] = []
  const emit = (e: Effect, u: Understood) => {
    effects.push(e)
    explained.push(u)
  }
  const usedAsTarget = new Set<string>()

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
    // « les enfants » seuls désignent un public, pas les naissances
    if (topics.length > 1 && !/naissan|natal|fecond|bebe|par femme|faire des enfants|baby|nombreuse|allocation|conge|creche/.test(n)) drop('fertility')
    return { raw, n, topics, q: findQuantity(n) }
  })

  // une proposition sans verbe de sens hérite du sens de sa voisine (« les naissances et les décès augmentent »)
  parts.forEach((p, i) => {
    if (p.topics.length && !p.q.dir) {
      const next = parts.slice(i + 1).find((x) => x.q.dir) ?? parts.slice(0, i).reverse().find((x) => x.q.dir)
      if (next) p.q = { ...next.q, factor: p.q.factor ?? next.q.factor }
    }
  })

  // zone de l'événement : premier lieu cité qui n'est pas une destination
  const allPlaces = findPlaces(whole, table)

  for (const p of parts) {
    const { raw, n, q } = p
    if (!p.topics.length) {
      const out = OUT_OF_MODEL.find((o) => o.re.test(n))
      const onlyContext = /\b(?:20[2-9]\d|2100|ans?|pendant|durant|partir|jusqu|definitiv|desormais)\b/.test(n) || findPlaces(n, table).length > 0
      if (out) ignored.push({ text: raw, reason: out.reason })
      else if (!onlyContext && n.split(' ').length > 1) ignored.push({ text: raw, reason: 'Je n’ai reconnu ici ni naissances, ni décès, ni migrations, ni déménagements.' })
      continue
    }
    const outHere = OUT_OF_MODEL.find((o) => o.re.test(n))
    if (outHere && /\bvot\w*|elect\w*|citoyen\w*/.test(n)) ignored.push({ text: raw, reason: outHere.reason })

    for (const topic of p.topics) {
      const who = findAges(n, topic)
      const whoText = who.label ? ` (${who.label})` : ''
      const dir: Direction | undefined = q.dir

      if (topic === 'retirement') {
        const m = n.match(/\b(\d{2})\s*ans\b/)
        const age = m ? Math.max(55, Math.min(75, Number(m[1]))) : undefined
        if (age === undefined) {
          ignored.push({ text: raw, reason: 'Précisez l’âge de départ à la retraite (par exemple « retraite à 67 ans »).' })
          continue
        }
        emit({ kind: 'retirementAge', age }, { text: raw, explanation: `Âge de départ à la retraite : ${age} ans. Cela change l’indicateur « pression retraites », pas la population.` })
        continue
      }

      if (topic === 'immigration') {
        const d = dir ?? 'up'
        let m = multFor('immigration', q, d)
        m = Math.max(0, Math.min(4, m))
        const local = allPlaces.find((pl) => pl.zone.level !== 'france' && !isDestination(pl))
        if (local) {
          const r = -(1 - m) * NATIONAL_EXT_RATE
          emit({ kind: 'external', rate: r, ages: who.ages }, { text: raw, explanation: `Solde avec l’étranger dans la zone : ${fmtSigned(r * 100, fmtDec1)} % d’habitants par an par rapport à la référence${whoText}.` })
        } else {
          emit({ kind: 'externalMult', mult: m }, {
            text: raw,
            explanation:
              m === 0
                ? 'Solde migratoire avec l’étranger ramené à zéro : autant de départs que d’arrivées, au lieu d’environ +150 000 personnes par an.'
                : `Solde migratoire avec l’étranger ${m < 1 ? 'réduit' : 'augmenté'} de ${pct(m).replace(/^[+−]\s?/, '')} : environ ${fmtSigned(150_000 * m)} personnes par an au lieu de +150 000.`,
          })
        }
        if (d === 'stop' || m < 0.3)
          notes.push('Le jeu suit le solde avec l’étranger (arrivées moins départs), pas les arrivées seules. « Plus personne ne vient » est traduit par un solde nul. En réalité, les départs continuant, il deviendrait négatif.')
        continue
      }

      if (topic === 'emigration') {
        const less = dir === 'down' || dir === 'stop'
        const r = (less ? 1 : -1) * MAG.emigration[q.strength]
        emit({ kind: 'external', rate: r, ages: who.ages ?? (/cerveaux|diplome|jeunes/.test(n) ? [18, 34] : undefined) }, { text: raw, explanation: `${less ? 'Moins de départs' : 'Départs supplémentaires'} vers l’étranger : ${rate(Math.abs(r))} des habitants${whoText} par an.` })
        continue
      }

      if (topic === 'fertility') {
        let m: number
        const icf = n.match(/(\d(?:[.,]\d+)?)\s*enfants? par femme/)
        if (icf) m = Number(icf[1].replace(',', '.')) / ICF_REF
        else m = multFor('fertility', q, dir ?? 'up')
        m = Math.max(0, Math.min(2.5, m))
        emit({ kind: 'fertility', mult: m }, {
          text: raw,
          explanation: icf
            ? `${icf[1].replace('.', ',')} enfants par femme au lieu de ${fmtDec2(ICF_REF)} dans la référence à long terme : naissances ${pct(m)}.`
            : `Naissances ${pct(m)}.`,
        })
        continue
      }

      if (topic === 'mortality') {
        // l'espérance de vie et les progrès médicaux vont dans l'autre sens que les décès
        const inverse = /esperance de vie|longevite|progres medic|soins|hopita|medecin|sante/.test(n) && !/epidemi|pandemi|virus|maladie|crise sanitaire/.test(n)
        let d: Direction = dir ?? (inverse ? 'up' : 'up')
        if (inverse) d = d === 'up' ? 'down' : d === 'down' ? 'up' : 'up'
        let m = multFor('mortality', { ...q, factor: inverse && q.factor ? 2 - q.factor : q.factor }, d)
        m = Math.max(0.3, Math.min(3, m))
        emit({ kind: 'mortality', mult: m, ages: who.ages, sex: who.sex }, { text: raw, explanation: `Décès ${pct(m)}${whoText}.` })
        continue
      }

      if (topic === 'move') {
        const here = findPlaces(n, table).filter((pl) => pl.zone.level !== 'france')
        let dest = here.find(isDestination)
        let origin = here.find((pl) => pl !== dest && isOrigin(pl)) ?? here.find((pl) => pl !== dest)
        if (/exode urbain|quitt\w* (?:les )?villes/.test(n) && !origin) origin = { zone: METROPOLES, label: 'Grandes métropoles', at: 0, before: '' }
        if (/exode urbain|teletravail/.test(n) && !dest) dest = { zone: DIAGONALE, label: 'Diagonale du vide', at: 0, before: '' }
        if (/exode rural/.test(n) && !origin) origin = { zone: DIAGONALE, label: 'Diagonale du vide', at: 0, before: '' }
        const ages = who.ages ?? [18, 64]
        const agesText = who.label ? ` (${who.label})` : ' (18-64 ans)'
        if (origin && dest && zoneKey(origin.zone) !== zoneKey(dest.zone)) {
          const r = MAG.move[q.strength] * (q.factor && q.factor > 1 ? q.factor : 1)
          usedAsTarget.add(zoneKey(origin.zone))
          emit({ kind: 'move', to: dest.zone, rate: r, ages }, { text: raw, explanation: `Chaque année, ${rate(r)} des habitants${agesText} de « ${origin.label} » partent vers « ${dest.label} ».` })
        } else if (dest && (dir === 'down' || dir === 'stop') && /attir|attracti/.test(n)) {
          const m = MAG.attract.down[q.strength]
          usedAsTarget.add(zoneKey(dest.zone))
          emit({ kind: 'attract', mult: m, ages }, { text: raw, explanation: `« ${dest.label} » attire ${pct(m).replace(/^[+−]\s?/, '')} de nouveaux arrivants en moins${agesText}.` })
        } else if (dest || (origin && /attir|attracti|redynamis|revitalis|repeupl|arrivent|affluent|afflux/.test(n))) {
          const target = dest ?? origin!
          const m = dir === 'down' || dir === 'stop' ? MAG.attract.down[q.strength] : MAG.attract.up[q.strength]
          usedAsTarget.add(zoneKey(target.zone))
          emit({ kind: 'attract', mult: m, ages }, { text: raw, explanation: `« ${target.label} » attire ${pct(m)} de nouveaux arrivants venus du reste de la France${agesText}.` })
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

  // zone de l'événement : celle des déménagements, sinon le premier lieu cité (hors destination)
  const moveZone = [...usedAsTarget][0]
  const zonePlace = moveZone
    ? (allPlaces.find((pl) => zoneKey(pl.zone) === moveZone) ?? { zone: zoneFromKey(moveZone), label: '', at: 0, before: '' })
    : allPlaces.find((pl) => pl.zone.level !== 'france' && !isDestination(pl))
  const zone = zonePlace?.zone ?? FRANCE
  const zoneLabel = zone.level === 'france' ? 'Toute la France' : (zonePlace?.label || namedLabel(zone))

  // fusion : un même effet national cité deux fois garde la version la plus forte
  const { merged, why } = mergeEffects(effects, explained)
  understood.unshift(...why)

  const libraryMatch =
    merged.length === 1 && merged[0].kind === 'externalMult' && merged[0].mult === 0 && zone.level === 'france' ? 'insee-solde-nul' : undefined
  if (libraryMatch) notes.unshift('C’est exactement la variante officielle « solde migratoire nul » de l’Insee : le jeu utilise l’événement de la bibliothèque, dont l’effet est vérifié.')

  const name = shortName(text)
  return {
    understood,
    ignored,
    notes: [...new Set(notes)],
    effects: merged,
    zone,
    zoneLabel,
    start: time.start,
    duration: time.duration,
    durationGiven: time.durationGiven,
    startGiven: time.startGiven,
    name,
    libraryMatch,
  }
}

function zoneFromKey(key: string): Zone {
  for (const z of [METROPOLES, DIAGONALE, LITTORAL, OUTRE_MER, IDF, SUD, NORD, OUEST]) if (zoneKey(z) === key) return z
  return FRANCE
}

function namedLabel(zone: Zone) {
  const k = zoneKey(zone)
  const found = NAMED.find((n) => zoneKey(n.zone) === k)
  return found?.label ?? 'Zone choisie'
}

/**
 * Fusionne les effets redondants : un même effet national cité deux fois garde la version la
 * plus forte ; deux effets identiques n'en font qu'un. Les explications suivent leur effet.
 */
function mergeEffects(effects: Effect[], explained: Understood[]) {
  const merged: Effect[] = []
  const why: Understood[] = []
  const strength = (e: Effect) => ('mult' in e ? Math.abs(e.mult - 1) : 0)
  effects.forEach((e, k) => {
    const same = merged.findIndex((o) => JSON.stringify(o) === JSON.stringify(e))
    const i = same >= 0 ? same : ['externalMult', 'fertility', 'retirementAge'].includes(e.kind) ? merged.findIndex((o) => o.kind === e.kind) : -1
    if (i < 0) {
      merged.push(e)
      why.push(explained[k])
      return
    }
    const text = why[i].text === explained[k].text ? why[i].text : `${why[i].text} ; ${explained[k].text}`
    if (e.kind === 'retirementAge' || strength(e) > strength(merged[i])) {
      merged[i] = e
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
  'Les jeunes quittent Paris pour la Bretagne pendant 15 ans',
  'Une épidémie frappe fortement les personnes âgées en 2035',
  'La retraite passe à 67 ans en 2030',
  'L’espérance de vie progresse fortement grâce aux progrès médicaux',
]

