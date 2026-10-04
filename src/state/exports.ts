import { areaDeps, areaName, type AreaRef } from '../engine/aggregate'
import { computeIndicators, totalPop } from '../engine/indicators'
import type { ModelData, SimResult } from '../engine/types'

/** Nombre au format tableur français : virgule décimale, pas de séparateur de milliers. */
const n = (x: number, digits = 0) => (Number.isFinite(x) ? x.toFixed(digits).replace('.', ',') : '')
const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const BOM = '﻿'

/** Évolution année par année d'une zone : scénario, référence et indicateurs. Séparateur « ; ». */
export function zoneCsv(data: ModelData, base: SimResult, res: SimResult, area: AreaRef): string {
  const deps = areaDeps(data, area)
  const head = [
    'annee',
    'population_scenario',
    'population_reference',
    'ecart',
    'naissances',
    'deces',
    'solde_migratoire',
    'age_median',
    'seniors_pour_100_actifs',
    'retraites_pour_100_cotisants_estime',
    'places_ecole_estime',
    'places_ehpad_estime',
  ]
  const rows = [head.join(';')]
  for (let yi = 0; yi < res.nYears; yi++) {
    const i = computeIndicators(data, res, deps, yi)
    const r = totalPop(base, deps, yi)
    rows.push(
      [
        data.startYear + yi,
        n(i.population),
        n(r),
        n(i.population - r),
        yi ? n(i.births) : '',
        yi ? n(i.deaths) : '',
        yi ? n(i.migrationBalance) : '',
        n(i.medianAge, 1),
        n(i.seniorsPer100Workers, 1),
        n(i.pensionPressure, 1),
        n(i.schoolPlaces),
        n(i.ehpadPlaces),
      ].join(';'),
    )
  }
  return `${BOM}# Et si… ? — ${areaName(data, area)} — projection par la méthode des composantes (données Insee, Licence Ouverte)\n${rows.join('\n')}\n`
}

/** Tous les départements pour une année. */
export function departmentsCsv(data: ModelData, base: SimResult, res: SimResult, yi: number): string {
  const rows = ['code;departement;region;population_scenario;population_reference;ecart_pct;age_median;seniors_pour_100_actifs']
  data.departments.forEach((d, i) => {
    const ind = computeIndicators(data, res, [i], yi)
    const r = totalPop(base, [i], yi)
    rows.push(
      [
        d.code,
        q(d.name),
        q(data.regions.find((x) => x.code === d.reg)?.name ?? d.reg),
        n(ind.population),
        n(r),
        n((100 * (ind.population - r)) / r, 2),
        n(ind.medianAge, 1),
        n(ind.seniorsPer100Workers, 1),
      ].join(';'),
    )
  })
  return `${BOM}# Et si… ? — départements au 1er janvier ${data.startYear + yi}\n${rows.join('\n')}\n`
}
