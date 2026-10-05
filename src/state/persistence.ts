import type { Effect, EventDef, Scenario, ScenarioEvent, Zone } from '../engine/types'
import { EVENT_LIBRARY } from '../events/library'

/* ------------------------------------------------------------------ validation */

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const KNOWN = new Set(EVENT_LIBRARY.map((e) => e.id))
const EFFECT_KINDS = new Set(['mortality', 'fertility', 'leave', 'attract', 'move', 'external', 'externalMult', 'retirementAge'])

function zoneOf(z: unknown): Zone | null {
  if (!z || typeof z !== 'object') return null
  const o = z as Record<string, unknown>
  if (o.level === 'france') return { level: 'france', codes: [] }
  if ((o.level === 'region' || o.level === 'dep') && Array.isArray(o.codes) && o.codes.every((c) => typeof c === 'string' && /^[0-9AB]{2,3}$/.test(c)))
    return { level: o.level, codes: (o.codes as string[]).slice(0, 96) }
  return null
}

function effectOf(e: unknown): Effect | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  if (!EFFECT_KINDS.has(o.kind as string)) return null
  const ages = Array.isArray(o.ages) && o.ages.length === 2 && o.ages.every(isNum) ? ([clamp(o.ages[0], 0, 100), clamp(o.ages[1], 0, 100)] as [number, number]) : undefined
  switch (o.kind) {
    case 'mortality':
    case 'fertility':
    case 'attract':
      return isNum(o.mult) ? ({ kind: o.kind, mult: clamp(o.mult, 0, 5), ages } as Effect) : null
    case 'leave':
      return isNum(o.rate) ? { kind: 'leave', rate: clamp(o.rate, 0, 0.5), ages } : null
    case 'external':
      return isNum(o.rate) ? { kind: 'external', rate: clamp(o.rate, -0.05, 0.05), ages } : null
    case 'externalMult':
      return isNum(o.mult) ? { kind: 'externalMult', mult: clamp(o.mult, 0, 5) } : null
    case 'retirementAge':
      return isNum(o.age) ? { kind: 'retirementAge', age: clamp(o.age, 55, 75) } : null
    case 'move': {
      const to = zoneOf(o.to)
      return to && isNum(o.rate) ? { kind: 'move', to, rate: clamp(o.rate, 0, 0.5), ages } : null
    }
  }
  return null
}

const str = (x: unknown, max: number, fallback = '') => (typeof x === 'string' ? x.slice(0, max) : fallback)

function customOf(d: unknown): EventDef | null {
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  const id = str(o.id, 60)
  if (!id.startsWith('perso-')) return null
  const effects = Array.isArray(o.effects) ? (o.effects.map(effectOf).filter(Boolean) as Effect[]).slice(0, 10) : []
  const dz = o.defaults as Record<string, unknown> | undefined
  return {
    id,
    name: str(o.name, 40, 'Événement importé'),
    family: 'perso',
    icon: str(o.icon, 20, 'custom'),
    summary: str(o.summary, 300),
    defaults: { duration: isNum(dz?.duration) ? clamp(dz.duration, 1, 75) : 10, intensity: 1, zone: zoneOf(dz?.zone) ?? { level: 'france', codes: [] } },
    profile: ['step', 'peak', 'ramp', 'pulse'].includes(o.profile as string) ? (o.profile as EventDef['profile']) : 'step',
    ...(o.persistent === true ? { persistent: true } : {}),
    effects,
    hypothesis: str(o.hypothesis, 400, 'Événement importé.'),
    source: str(o.source, 200, 'Hypothèse du joueur.'),
    estimated: true,
  }
}

/**
 * Valide un scénario venu de l'extérieur (fichier, lien) : types connus, bornes numériques,
 * textes tronqués. Renvoie null si l'objet n'est pas un scénario exploitable.
 */
export function validateScenario(x: unknown): Scenario | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.events)) return null
  const custom = Array.isArray(o.custom) ? (o.custom.map(customOf).filter(Boolean) as EventDef[]).slice(0, 30) : []
  const ids = new Set([...KNOWN, ...custom.map((c) => c.id)])
  const events: ScenarioEvent[] = []
  for (const e of o.events.slice(0, 60)) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const zone = zoneOf(r.zone)
    if (typeof r.type !== 'string' || !ids.has(r.type) || !zone || !isNum(r.start) || !isNum(r.duration) || !isNum(r.intensity)) continue
    events.push({
      uid: str(r.uid, 40) || `i${events.length}`,
      type: r.type,
      start: clamp(Math.round(r.start), 2025, 2099),
      duration: clamp(Math.round(r.duration), 1, 75),
      intensity: clamp(r.intensity, 0.1, 2),
      zone,
    })
  }
  return {
    v: 1,
    name: str(o.name, 60, 'Scénario importé') || 'Scénario importé',
    seed: isNum(o.seed) ? Math.abs(Math.round(o.seed)) % 2147483647 : 1,
    randomness: isNum(o.randomness) ? clamp(o.randomness, 0, 1) : 0,
    events,
    custom,
  }
}

/* ------------------------------------------------------------------ lien de partage */

const toB64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Scénario → texte compact pour l'URL (JSON compressé deflate, base64url). */
export async function encodeScenario(sc: Scenario): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(sc))
  return toB64url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeScenario(s: string): Promise<Scenario | null> {
  try {
    const raw = await pipe(fromB64url(s), new DecompressionStream('deflate-raw'))
    return validateScenario(JSON.parse(new TextDecoder().decode(raw)))
  } catch {
    return null
  }
}

/** Lien de partage ; `year` (facultatif) est l'année affichée à l'ouverture du lien. */
export async function shareUrl(sc: Scenario, year?: number): Promise<string> {
  const u = new URL(location.href)
  u.hash = ''
  u.searchParams.set('s', await encodeScenario(sc))
  if (year !== undefined) u.searchParams.set('a', String(Math.round(year)))
  else u.searchParams.delete('a')
  u.searchParams.delete('tutoriel')
  return u.toString()
}

/** Année demandée par un lien de partage (?a=2080), si elle est valide. */
export function sharedYear(search: string, startYear: number, endYear: number): number | null {
  const a = Number(new URLSearchParams(search).get('a'))
  return Number.isInteger(a) && a >= startYear && a <= endYear ? a : null
}

/* ------------------------------------------------------------------ brouillon automatique */

const DRAFT_KEY = 'etsi.draft'

export interface Draft {
  scenario: Scenario
  year: number
  savedAt: string
}

/** Garde le bac à sable en cours dans le navigateur : une recharge de la page ne le perd plus. */
export function saveDraft(sc: Scenario, year: number): void {
  try {
    if (!sc.events.length && !sc.custom.length && !(sc.randomness > 0)) localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ scenario: sc, year, savedAt: new Date().toISOString() }))
  } catch {
    /* stockage indisponible : pas de brouillon */
  }
}

export function loadDraft(): Draft | null {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Record<string, unknown> | null
    const scenario = validateScenario(o?.scenario)
    if (!o || !scenario || (!scenario.events.length && !scenario.custom.length)) return null
    return { scenario, year: isNum(o.year) ? o.year : 2025, savedAt: str(o.savedAt, 40) }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ sauvegardes locales */

export interface SavedScenario {
  name: string
  savedAt: string
  scenario: Scenario
}

const KEY = 'etsi.saves'

export function listSaves(): SavedScenario[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]
    return raw.flatMap((r) => {
      const o = r as Record<string, unknown>
      const sc = validateScenario(o?.scenario)
      return sc ? [{ name: str(o.name, 60, sc.name), savedAt: str(o.savedAt, 40), scenario: sc }] : []
    })
  } catch {
    return []
  }
}

export function writeSaves(list: SavedScenario[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export function saveScenario(name: string, sc: Scenario): boolean {
  const list = listSaves().filter((s) => s.name !== name)
  return writeSaves([{ name, savedAt: new Date().toISOString(), scenario: { ...sc, name } }, ...list].slice(0, 50))
}

export function deleteSave(name: string): boolean {
  return writeSaves(listSaves().filter((s) => s.name !== name))
}

/* ------------------------------------------------------------------ fichiers */

export function download(filename: string, content: Blob | string, type = 'application/octet-stream') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'scenario'
