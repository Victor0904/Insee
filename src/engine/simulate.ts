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
  /** Conserve l'état exact (double précision) de chaque 1er janvier, pour servir de point de reprise. */
  keepStates?: boolean
  /**
   * Point de reprise : résultat et états d'une simulation SANS événement ni aléa (la référence).
   * Les années antérieures au premier événement sont alors recopiées au lieu d'être recalculées :
   * le résultat est identique au bit près, pour un coût moindre.
   */
  checkpoint?: { result: SimResult; states: Float64Array[] }
  /**
   * Fournisseur de tableaux réutilisables (évite d'allouer ~9 Mo par simulation, ce qui déclenche
   * le ramasse-miettes). Doit renvoyer un Float32Array de la longueur demandée, de contenu quelconque.
   */
  alloc?: (length: number) => Float32Array
}

/** États exacts de chaque 1er janvier (si `keepStates`). */
export interface SimResultWithStates extends SimResult {
  states?: Float64Array[]
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
export function simulate(data: ModelData, scenario: Scenario, catalog: EventCatalog, opts: SimOptions = {}): SimResultWithStates {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const n = data.nDep
  const Y = data.nYears
  const cell = SEXES * AGES
  const block = n * cell

  const events = expandCascades(scenario, catalog, data.endYear)
  const compiled = prepareEvents(data, events, catalog)
  const mods = createModifiers(data)

  const alloc = opts.alloc ?? ((len: number) => new Float32Array(len))
  const pop = alloc(Y * block) // entièrement réécrit plus bas
  const comps = alloc(Y * n * N_COMP).fill(0)
  const flows = opts.recordFlows ? alloc(Y * n * n).fill(0) : undefined
  const retirementAge = alloc(Y).fill(64)

  let cur = Float64Array.from(data.pop0)
  let next = new Float64Array(block)
  const delta = new Float64Array(block)
  const depTotal = new Float64Array(n)
  const norm = new Float64Array(data.nBroad * n)
  const moverBg = new Float64Array(SEXES * data.nBroad)
  const extraBg = new Float64Array(SEXES * data.nBroad)
  const overseas = data.overseas
  let maxDest = 0
  for (let i = 0; i < data.nBroad * n; i++) maxDest = Math.max(maxDest, data.destStart[i + 1] - data.destStart[i])
  const shareTmp = new Float64Array(maxDest)
  const moverProfile = new Float64Array(SEXES * AGES)
  const bgTotals = new Float64Array(SEXES * data.nBroad)
  const inflowBg = new Float64Array(n * SEXES * data.nBroad)
  const ageShare = new Float64Array(SEXES * AGES)
  const moveVec = new Float64Array(cell)
  pop.set(cur, 0)

  // aléa reproductible
  const rand = mulberry32(scenario.seed || 1)
  const r = Math.max(0, Math.min(1, scenario.randomness || 0))
  const fertNoise = new Float64Array(n).fill(1)
  const mortNoise = new Float64Array(n).fill(1)
  const migNoise = new Float64Array(n).fill(1)

  let clipped = 0
  const states: Float64Array[] | undefined = opts.keepStates ? [Float64Array.from(cur)] : undefined

  // reprise : avant le premier événement, le scénario est identique à la référence
  let first = 0
  const ck = opts.checkpoint
  if (ck && r === 0 && ck.states.length === Y && (!flows || ck.result.flows)) {
    first = compiled.length ? Math.max(0, Math.min(Y - 1, Math.min(...compiled.map((c) => c.ev.start)) - data.startYear)) : Y - 1
    if (first > 0) {
      pop.set(ck.result.pop.subarray(0, (first + 1) * block))
      comps.set(ck.result.comps.subarray(0, first * n * N_COMP))
      if (flows && ck.result.flows) flows.set(ck.result.flows.subarray(0, first * n * n))
      retirementAge.set(ck.result.retirementAge.subarray(0, first))
      cur = Float64Array.from(ck.states[first])
      if (states) for (let i = 1; i <= first; i++) states.push(Float64Array.from(ck.states[i]))
    }
  }

  for (let yi = first; yi < Y - 1; yi++) {
    const y = data.startYear + yi
    // remet les modificateurs à leur valeur neutre puis applique les événements actifs
    if (yi === 0 || compiled.length > 0) fillModifiers(data, mods, compiled, y)
    retirementAge[yi] = mods.retirementAge

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
    // Attractivité modifiée : les parts des destinations sont repondérées puis renormalisées.
    // Depuis la métropole, les parts vers l'outre-mer gardent leur valeur absolue : un littoral
    // ou un Sud devenus répulsifs ne poussent pas les habitants vers des îles tropicales
    // (renormalisation limitée aux destinations de métropole).
    if (mods.anyAttract) {
      for (let bg = 0; bg < data.nBroad; bg++)
        for (let o = 0; o < n; o++) {
          const metroOrigin = overseas[o] === 0
          let z = 0
          let fixed = 0
          for (let k = data.destStart[bg * n + o]; k < data.destStart[bg * n + o + 1]; k++) {
            const v = data.destShare[k] * mods.attract[bg * n + data.destIdx[k]]
            if (metroOrigin && overseas[data.destIdx[k]]) fixed += v
            else z += v
          }
          norm[bg * n + o] = z > 0 ? Math.max(0, 1 - fixed) / z : 0
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
      extraBg.fill(0)
      let anyExtra = false
      // depuis la métropole, les départs supplémentaires (événements « des gens partent ») vont
      // vers d'autres départements de métropole, pas vers l'outre-mer
      const metroOrigin = overseas[o] === 0
      for (let s = 0; s < SEXES; s++) {
        const rBase = (o * SEXES + s) * 20
        const base = o * cell + s * AGES
        for (let a = 0; a < AGES; a++) {
          const p = next[base + a]
          if (p === 0) continue
          const bg = data.ageToBroad[a]
          // pas de destination connue (Mayotte) : personne ne part, sinon les départs disparaîtraient
          if (data.destStart[bg * n + o + 1] === data.destStart[bg * n + o]) continue
          const baseRate = Math.min(MAX_OUT_RATE, data.migRate[rBase + Math.min(Math.floor(a / 5), 19)] * migNoise[o])
          const rate = Math.min(MAX_OUT_RATE, baseRate + mods.leave[o * AGES + a])
          const m = p * rate
          if (m === 0) continue
          delta[base + a] -= m
          moverProfile[s * AGES + a] += m
          if (metroOrigin && rate > baseRate) {
            const extra = p * (rate - baseRate)
            extraBg[s * nB + bg] += extra
            moverBg[s * nB + bg] += m - extra
            anyExtra = true
          } else moverBg[s * nB + bg] += m
          outTotal += m
        }
      }
      if (outTotal === 0) continue
      comps[compBase + o * N_COMP + COMP_OUT] += outTotal
      for (let bg = 0; bg < nB; bg++) {
        const mH = moverBg[bg]
        const mF = moverBg[nB + bg]
        const xH = anyExtra ? extraBg[bg] : 0
        const xF = anyExtra ? extraBg[nB + bg] : 0
        if (mH + mF + xH + xF === 0) continue
        const k0 = data.destStart[bg * n + o]
        const k1 = data.destStart[bg * n + o + 1]
        const z = mods.anyAttract ? norm[bg * n + o] : 1
        // part effective de chaque destination, et total des destinations de métropole
        let zMetro = 0
        for (let k = k0; k < k1; k++) {
          const dd = data.destIdx[k]
          const fixed = metroOrigin && overseas[dd] === 1
          const share = mods.anyAttract ? data.destShare[k] * mods.attract[bg * n + dd] * (fixed ? 1 : z) : data.destShare[k]
          shareTmp[k - k0] = share
          if (overseas[dd] === 0) zMetro += share
        }
        const xScale = xH + xF > 0 && zMetro > 0 ? 1 / zMetro : 0
        for (let k = k0; k < k1; k++) {
          const dd = data.destIdx[k]
          let share = shareTmp[k - k0]
          let vH = mH * share
          let vF = mF * share
          if (xScale > 0 && overseas[dd] === 0) {
            share *= xScale
            vH += xH * share
            vF += xF * share
          }
          inflowBg[(dd * SEXES) * nB + bg] += vH
          inflowBg[(dd * SEXES + 1) * nB + bg] += vF
          if (flows) flows[flowBase + o * n + dd] += vH + vF
        }
        // sans destination en métropole (cas théorique), les départs supplémentaires suivent les parts habituelles
        if (xH + xF > 0 && xScale === 0)
          for (let k = k0; k < k1; k++) {
            const dd = data.destIdx[k]
            inflowBg[(dd * SEXES) * nB + bg] += xH * shareTmp[k - k0]
            inflowBg[(dd * SEXES + 1) * nB + bg] += xF * shareTmp[k - k0]
            if (flows) flows[flowBase + o * n + dd] += (xH + xF) * shareTmp[k - k0]
          }
      }
    }
    // profil par âge des migrants au sein de chaque classe large
    bgTotals.fill(0)
    for (let s = 0; s < SEXES; s++)
      for (let a = 0; a < AGES; a++) bgTotals[s * nB + data.ageToBroad[a]] += moverProfile[s * AGES + a]
    // part de chaque âge dans sa classe large (multiplication plutôt que division dans la boucle)
    for (let s = 0; s < SEXES; s++)
      for (let a = 0; a < AGES; a++) {
        const tot = bgTotals[s * nB + data.ageToBroad[a]]
        ageShare[s * AGES + a] = tot === 0 ? 0 : moverProfile[s * AGES + a] / tot
      }
    for (let d = 0; d < n; d++) {
      let inTotal = 0
      for (let s = 0; s < SEXES; s++) {
        const dst = d * cell + s * AGES
        const inBase = (d * SEXES + s) * nB
        for (let a = 0; a < AGES; a++) {
          const v = inflowBg[inBase + data.ageToBroad[a]] * ageShare[s * AGES + a]
          delta[dst + a] += v
          inTotal += v
        }
      }
      comps[compBase + d * N_COMP + COMP_IN] += inTotal
    }
    // déménagements ciblés (événements « des gens partent de… vers… ») : les départs de toutes les
    // origines sont cumulés par sexe et âge, puis répartis une seule fois entre les destinations
    for (const mv of mods.moves) {
      let toTotal = 0
      for (const d of mv.to) toTotal += depTotal[d]
      if (toTotal <= 0) continue
      moveVec.fill(0)
      let movedAll = 0
      for (const o of mv.from) {
        let moved = 0
        for (let i = 0; i < cell; i++) {
          const v = next[o * cell + i] * Math.min(MAX_OUT_RATE, mv.rate[i % AGES])
          if (v === 0) continue
          moved += v
          moveVec[i] += v
          delta[o * cell + i] -= v
        }
        if (moved === 0) continue
        movedAll += moved
        comps[compBase + o * N_COMP + COMP_OUT] += moved
        if (flows) for (const dd of mv.to) flows[flowBase + o * n + dd] += (moved * depTotal[dd]) / toTotal
      }
      if (movedAll === 0) continue
      for (const dd of mv.to) {
        const w = depTotal[dd] / toTotal
        const dst = dd * cell
        for (let i = 0; i < cell; i++) delta[dst + i] += moveVec[i] * w
        comps[compBase + dd * N_COMP + COMP_IN] += movedAll * w
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
      let prof = 0
      for (let s = 0; s < SEXES; s++) for (let a = ex.ages[0]; a <= ex.ages[1]; a++) prof += data.extProfile[pBase + s * AGES + a]
      if (prof <= 0) continue
      for (const d of ex.deps) {
        // taux appliqué à la population du département : même intensité quelle que soit la taille de la zone
        const share = ex.rate * depTotal[d]
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
    if (states) states.push(Float64Array.from(next))
    const tmp = cur
    cur = next
    next = tmp
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (compiled.length > 0) {
    fillModifiers(data, mods, compiled, data.endYear)
    retirementAge[Y - 1] = mods.retirementAge
  }
  return { startYear: data.startYear, nYears: Y, nDep: n, pop, comps, flows, retirementAge, events, clipped, elapsedMs: t1 - t0, states, computedFrom: data.startYear + first }
}
