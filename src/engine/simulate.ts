import { createModifiers, expandCascades, fillModifiers, prepareEvents, type EventCatalog } from './events'
import { lognormalFactor, mulberry32 } from './rng'
import * as T from './types'
import type { ModelData, Scenario, SimResult } from './types'

// Copies locales des constantes : certains chargeurs de modules (Vitest) transforment les imports
// en accès de propriétés, ce qui ralentit fortement les boucles internes.
const AGES = T.AGES
const SEXES = T.SEXES
const FEMALE = T.FEMALE
const N_COMP = T.N_COMP
const COMP_BIRTHS = T.COMP_BIRTHS
const COMP_DEATHS = T.COMP_DEATHS
const COMP_IN = T.COMP_IN
const COMP_OUT = T.COMP_OUT
const COMP_EXT = T.COMP_EXT

export interface SimOptions {
  /** Enregistre la matrice des flux bruts entre départements pour chaque année (pour la carte). */
  recordFlows?: boolean
}

const MAX_OUT_RATE = 0.9

/**
 * Projection par la méthode des composantes, au pas annuel, par département × sexe × âge simple.
 *
 * Pour l'année y (du 1er janvier y au 1er janvier y+1) :
 *  1. survie et vieillissement : P'(a+1) = P(a) × (1 − q(a+1, y))   (q par âge atteint dans l'année)
 *  2. naissances : Σ femmes × taux de fécondité par âge atteint, puis survie des nouveau-nés (q(0, y))
 *  3. migrations internes : taux de sortie × population, répartis selon les destinations observées
 *  4. solde migratoire extérieur : niveau national × part du département × profil par âge
 *
 * Fonction pure et déterministe : même scénario (et même graine) → mêmes résultats.
 */
export function simulate(data: ModelData, scenario: Scenario, catalog: EventCatalog, opts: SimOptions = {}): SimResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const n = data.nDep
  const Y = data.nYears
  const cell = SEXES * AGES
  const block = n * cell

  const events = expandCascades(scenario, catalog, data.endYear)
  const compiled = prepareEvents(data, events, catalog)
  const mods = createModifiers(data)

  const pop = new Float32Array(Y * block)
  const comps = new Float32Array(Y * n * N_COMP)
  const flows = opts.recordFlows ? new Float32Array(Y * n * n) : undefined

  let cur = Float64Array.from(data.pop0)
  let next = new Float64Array(block)
  const delta = new Float64Array(block)
  const depTotal = new Float64Array(n)
  const norm = new Float64Array(data.nBroad * n)
  const moverBg = new Float64Array(SEXES * data.nBroad)
  const moverProfile = new Float64Array(SEXES * AGES)
  const bgTotals = new Float64Array(SEXES * data.nBroad)
  const inflowBg = new Float64Array(n * SEXES * data.nBroad)
  pop.set(cur, 0)

  // aléa reproductible
  const rand = mulberry32(scenario.seed || 1)
  const r = Math.max(0, Math.min(1, scenario.randomness || 0))
  const fertNoise = new Float64Array(n).fill(1)
  const mortNoise = new Float64Array(n).fill(1)
  const migNoise = new Float64Array(n).fill(1)

  let clipped = 0

  for (let yi = 0; yi < Y - 1; yi++) {
    const y = data.startYear + yi
    // remet les modificateurs à leur valeur neutre puis applique les événements actifs
    if (yi === 0 || compiled.length > 0) fillModifiers(data, mods, compiled, y)

    if (r > 0) {
      const gf = lognormalFactor(rand, 0.04 * r)
      const gm = lognormalFactor(rand, 0.04 * r)
      const gg = lognormalFactor(rand, 0.08 * r)
      for (let d = 0; d < n; d++) {
        fertNoise[d] = gf * lognormalFactor(rand, 0.02 * r)
        mortNoise[d] = gm * lognormalFactor(rand, 0.02 * r)
        migNoise[d] = gg * lognormalFactor(rand, 0.04 * r)
      }
    }

    next.fill(0)
    const compBase = yi * n * N_COMP

    /* 1-2. survie, vieillissement, naissances */
    for (let d = 0; d < n; d++) {
      let deaths = 0
      let births = 0
      for (let s = 0; s < SEXES; s++) {
        const base = d * cell + s * AGES
        const qBase = (s * Y + yi) * AGES
        const k = data.mortFactor[d * SEXES + s] * mortNoise[d]
        const mm = (d * SEXES + s) * AGES
        for (let a = 0; a < AGES; a++) {
          const p = cur[base + a]
          if (p === 0) continue
          const qa = Math.min(1, data.q[qBase + Math.min(a + 1, AGES - 1)] * k * mods.mortMult[mm + a])
          const dead = p * qa
          deaths += dead
          next[base + Math.min(a + 1, AGES - 1)] += p - dead
        }
        if (s === FEMALE) {
          const fBase = yi * AGES
          for (let a = 11; a < 55; a++) {
            const x = a + 1 // âge atteint dans l'année
            const g = data.fertGroupOfAge[x]
            if (g < 0) continue
            const w = cur[base + a]
            if (w === 0) continue
            const qx = Math.min(1, data.q[qBase + x] * k * mods.mortMult[mm + a])
            births +=
              data.fert[fBase + x] *
              data.fertFactor[d * data.nFertGroups + g] *
              mods.fertMult[d * AGES + a] *
              fertNoise[d] *
              w *
              (1 - 0.5 * qx)
          }
        }
      }
      // nouveau-nés survivants au 1er janvier suivant (âge 0)
      for (let s = 0; s < SEXES; s++) {
        const b = births * (s === 0 ? data.boysShare : 1 - data.boysShare)
        const q0 = Math.min(1, data.q[(s * Y + yi) * AGES] * data.mortFactor[d * SEXES + s] * mortNoise[d] * mods.mortMult[(d * SEXES + s) * AGES])
        deaths += b * q0
        next[d * cell + s * AGES] += b * (1 - q0)
      }
      comps[compBase + d * N_COMP + COMP_BIRTHS] = births
      comps[compBase + d * N_COMP + COMP_DEATHS] = deaths
    }

    /* 3. migrations internes (sur la population au 1er janvier suivant) */
    delta.fill(0)
    for (let d = 0; d < n; d++) {
      let t = 0
      for (let i = 0; i < cell; i++) t += next[d * cell + i]
      depTotal[d] = t
    }
    if (mods.anyAttract) {
      for (let bg = 0; bg < data.nBroad; bg++)
        for (let o = 0; o < n; o++) {
          let z = 0
          for (let k = data.destStart[bg * n + o]; k < data.destStart[bg * n + o + 1]; k++)
            z += data.destShare[k] * mods.attract[bg * n + data.destIdx[k]]
          norm[bg * n + o] = z > 0 ? 1 / z : 0
        }
    }
    // Les départs sont calculés par âge simple. Les arrivées sont d'abord cumulées par
    // destination × sexe × classe large, puis réparties par âge simple selon le profil national
    // des migrants de l'année dans cette classe : les effectifs par âge sont conservés exactement
    // au niveau national, pour un coût ~10 fois moindre qu'une répartition âge par âge.
    const flowBase = flows ? yi * n * n : 0
    const nB = data.nBroad
    inflowBg.fill(0)
    moverProfile.fill(0)
    for (let o = 0; o < n; o++) {
      let outTotal = 0
      moverBg.fill(0)
      for (let s = 0; s < SEXES; s++) {
        const rBase = (o * SEXES + s) * 20
        const base = o * cell + s * AGES
        for (let a = 0; a < AGES; a++) {
          const p = next[base + a]
          const rate = Math.min(
            MAX_OUT_RATE,
            data.migRate[rBase + Math.min(Math.floor(a / 5), 19)] * migNoise[o] + mods.leave[o * AGES + a],
          )
          const m = p * rate
          if (m === 0) continue
          delta[base + a] -= m
          moverProfile[s * AGES + a] += m
          moverBg[s * nB + data.ageToBroad[a]] += m
          outTotal += m
        }
      }
      if (outTotal === 0) continue
      comps[compBase + o * N_COMP + COMP_OUT] += outTotal
      for (let bg = 0; bg < nB; bg++) {
        const mH = moverBg[bg]
        const mF = moverBg[nB + bg]
        if (mH + mF === 0) continue
        const k0 = data.destStart[bg * n + o]
        const k1 = data.destStart[bg * n + o + 1]
        const z = mods.anyAttract ? norm[bg * n + o] : 1
        for (let k = k0; k < k1; k++) {
          const dd = data.destIdx[k]
          const share = mods.anyAttract ? data.destShare[k] * mods.attract[bg * n + dd] * z : data.destShare[k]
          inflowBg[(dd * SEXES) * nB + bg] += mH * share
          inflowBg[(dd * SEXES + 1) * nB + bg] += mF * share
          if (flows) flows[flowBase + o * n + dd] += (mH + mF) * share
        }
      }
    }
    // profil par âge des migrants au sein de chaque classe large
    bgTotals.fill(0)
    for (let s = 0; s < SEXES; s++)
      for (let a = 0; a < AGES; a++) bgTotals[s * nB + data.ageToBroad[a]] += moverProfile[s * AGES + a]
    for (let d = 0; d < n; d++) {
      let inTotal = 0
      for (let s = 0; s < SEXES; s++) {
        const dst = d * cell + s * AGES
        for (let a = 0; a < AGES; a++) {
          const bg = data.ageToBroad[a]
          const tot = bgTotals[s * nB + bg]
          if (tot === 0) continue
          const v = (inflowBg[(d * SEXES + s) * nB + bg] * moverProfile[s * AGES + a]) / tot
          delta[dst + a] += v
          inTotal += v
        }
      }
      comps[compBase + d * N_COMP + COMP_IN] += inTotal
    }
    // déménagements ciblés (événements « des gens partent de… vers… »)
    for (const mv of mods.moves) {
      let toTotal = 0
      for (const d of mv.to) toTotal += depTotal[d]
      if (toTotal <= 0) continue
      for (const o of mv.from) {
        let moved = 0
        for (let s = 0; s < SEXES; s++)
          for (let a = 0; a < AGES; a++) {
            const v = next[o * cell + s * AGES + a] * Math.min(MAX_OUT_RATE, mv.rate[a])
            if (v === 0) continue
            moved += v
            delta[o * cell + s * AGES + a] -= v
            for (const dd of mv.to) delta[dd * cell + s * AGES + a] += (v * depTotal[dd]) / toTotal
          }
        if (moved === 0) continue
        comps[compBase + o * N_COMP + COMP_OUT] += moved
        for (const dd of mv.to) {
          const v = (moved * depTotal[dd]) / toTotal
          comps[compBase + dd * N_COMP + COMP_IN] += v
          if (flows) flows[flowBase + o * n + dd] += v
        }
      }
    }
    for (let i = 0; i < block; i++) next[i] += delta[i]

    /* 4. migrations extérieures */
    const level = data.extLevel[yi] * mods.extMult * migNoise[0]
    const pBase = yi * SEXES * AGES
    for (let d = 0; d < n; d++) {
      const w = data.extWeight[d] * level
      let added = 0
      for (let i = 0; i < cell; i++) {
        const v = w * data.extProfile[pBase + i]
        next[d * cell + i] += v
        added += v
      }
      comps[compBase + d * N_COMP + COMP_EXT] = added
    }
    for (const ex of mods.extAdd) {
      let tot = 0
      for (const d of ex.deps) tot += depTotal[d]
      let prof = 0
      for (let s = 0; s < SEXES; s++) for (let a = ex.ages[0]; a <= ex.ages[1]; a++) prof += data.extProfile[pBase + s * AGES + a]
      if (tot <= 0 || prof <= 0) continue
      for (const d of ex.deps) {
        const share = (ex.perYear * depTotal[d]) / tot
        for (let s = 0; s < SEXES; s++)
          for (let a = ex.ages[0]; a <= ex.ages[1]; a++)
            next[d * cell + s * AGES + a] += (share * data.extProfile[pBase + s * AGES + a]) / prof
        comps[compBase + d * N_COMP + COMP_EXT] += share
      }
    }

    for (let i = 0; i < block; i++)
      if (next[i] < 0) {
        clipped -= next[i]
        next[i] = 0
      }

    pop.set(next, (yi + 1) * block)
    const tmp = cur
    cur = next
    next = tmp
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return { startYear: data.startYear, nYears: Y, nDep: n, pop, comps, flows, events, clipped, elapsedMs: t1 - t0 }
}
