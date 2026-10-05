import { AGES, SEXES, type ModelData, type RawData } from './types'

/** Transforme les JSON de public/data en tableaux typés prêts pour la simulation. */
export function compileData(raw: RawData): ModelData {
  const { meta, population, mortality, fertility, internal, external } = raw
  const deps = meta.departments
  const n = deps.length
  const startYear = population.year
  const endYear = meta.endYear
  const nYears = endYear - startYear + 1

  const yearIndex = (years: number[], y: number) => {
    const i = years.indexOf(y)
    return i >= 0 ? i : y < years[0] ? 0 : years.length - 1
  }

  const regionIndex = new Int8Array(n)
  deps.forEach((d, i) => {
    regionIndex[i] = meta.regions.findIndex((r) => r.code === d.reg)
  })

  const overseas = Uint8Array.from(deps, (d) => (d.code.startsWith('97') ? 1 : 0))

  const pop0 = new Float64Array(n * SEXES * AGES)
  for (let d = 0; d < n; d++)
    for (let s = 0; s < SEXES; s++)
      for (let a = 0; a < AGES; a++) pop0[(d * SEXES + s) * AGES + a] = population.pop[d][s][a]

  const q = new Float64Array(SEXES * nYears * AGES)
  for (let s = 0; s < SEXES; s++)
    for (let y = 0; y < nYears; y++) {
      const row = mortality.q[s][yearIndex(mortality.years, startYear + y)]
      for (let a = 0; a < AGES; a++) q[(s * nYears + y) * AGES + a] = row[a]
    }
  const mortFactor = new Float64Array(n * SEXES)
  for (let d = 0; d < n; d++) for (let s = 0; s < SEXES; s++) mortFactor[d * SEXES + s] = mortality.depFactor[d][s]

  const fert = new Float64Array(nYears * AGES)
  for (let y = 0; y < nYears; y++) {
    const row = fertility.rate[yearIndex(fertility.years, startYear + y)]
    for (let a = 0; a < AGES; a++) fert[y * AGES + a] = row[a]
  }
  const icfRef = new Float64Array(nYears)
  for (let y = 0; y < nYears; y++) for (let a = 0; a < AGES; a++) icfRef[y] += fert[y * AGES + a]
  const nFertGroups = fertility.groups.length
  const fertGroupOfAge = new Int8Array(AGES).fill(-1)
  fertility.groups.forEach(([lo, hi], g) => {
    for (let a = lo; a <= Math.min(hi, AGES - 1); a++) fertGroupOfAge[a] = g
  })
  const fertFactor = new Float64Array(n * nFertGroups)
  for (let d = 0; d < n; d++) for (let g = 0; g < nFertGroups; g++) fertFactor[d * nFertGroups + g] = fertility.depFactor[d][g]

  const migRate = new Float64Array(n * SEXES * 20)
  for (let d = 0; d < n; d++)
    for (let s = 0; s < SEXES; s++)
      for (let g = 0; g < 20; g++) migRate[(d * SEXES + s) * 20 + g] = internal.rate[d][s][g]

  const nBroad = internal.destGroups.length
  const ageToBroad = new Int8Array(AGES)
  for (let a = 0; a < AGES; a++) {
    const mid = Math.min(Math.floor(a / 5), 19) * 5 + 2
    ageToBroad[a] = internal.destGroups.findIndex(([lo, hi]) => lo <= mid && mid <= hi)
  }
  let total = 0
  for (const per of internal.dest) for (const list of per) total += list.length
  const destStart = new Int32Array(nBroad * n + 1)
  const destIdx = new Int16Array(total)
  const destShare = new Float64Array(total)
  let k = 0
  for (let bg = 0; bg < nBroad; bg++)
    for (let o = 0; o < n; o++) {
      destStart[bg * n + o] = k
      // les parts sont arrondies dans le JSON : on les renormalise pour que chaque départ arrive quelque part
      const list = internal.dest[bg][o]
      const sum = list.reduce((t, [, p]) => t + p, 0)
      for (const [dd, p] of list) {
        destIdx[k] = dd
        destShare[k] = sum > 0 ? p / sum : 0
        k++
      }
    }
  destStart[nBroad * n] = k

  const extLevel = new Float64Array(nYears)
  const extProfile = new Float64Array(nYears * SEXES * AGES)
  for (let y = 0; y < nYears; y++) {
    const yi = yearIndex(external.years, startYear + y)
    extLevel[y] = external.level[yi]
    for (let s = 0; s < SEXES; s++)
      for (let a = 0; a < AGES; a++) extProfile[(y * SEXES + s) * AGES + a] = external.profile[yi][s][a]
  }
  const extWeight = Float64Array.from(external.depWeight)

  return {
    nDep: n,
    startYear,
    endYear,
    nYears,
    departments: deps,
    regions: meta.regions,
    regionIndex,
    overseas,
    areaKm2: Float64Array.from(raw.areaKm2 ?? new Array<number>(n).fill(NaN)),
    pop0,
    q,
    mortFactor,
    fert,
    icfRef,
    fertGroupOfAge,
    nFertGroups,
    fertFactor,
    boysShare: fertility.boysPerGirl / (1 + fertility.boysPerGirl),
    migRate,
    ageToBroad,
    nBroad,
    destStart,
    destIdx,
    destShare,
    extLevel,
    extProfile,
    extWeight,
  }
}
