"""Construit les données compactes de « Et si… ? » à partir des fichiers INSEE.

Usage : python scripts/build-data/build.py [--download]

Entrées  : .cache/raw/*        (téléchargées depuis les URL de sources.py)
Sorties  : public/data/*.json  + public/data/build-report.json (contrôles chiffrés)

Conventions
- 96 départements de France métropolitaine, ordre de `meta.json`.
- Sexe : 0 = hommes, 1 = femmes.
- Âges simples 0..100, la case 100 = « 100 ans et plus ».
- Chaque valeur qui n'est pas lue telle quelle dans une source est marquée
  « estimé » dans meta.json (`status`) et expliquée dans DECISIONS.md.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

import duckdb
import openpyxl

from sources import SOURCES

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / ".cache" / "raw"
OUT = ROOT / "public" / "data"
AGES = 101
START_YEAR = 2025
END_YEAR = 2100
METRO_REGIONS = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94"]
# Grandes classes d'âge pour les matrices de destination des migrations internes.
# Répartition géographique du solde extérieur : "inflow" (arrivées observées au recensement)
# ou "residual" (solde apparent DEP1 moins migrations internes). Voir DECISIONS.md.
EXTERNAL_WEIGHTS = "residual"
DEST_GROUPS = [(0, 14), (15, 19), (20, 24), (25, 29), (30, 39), (40, 54), (55, 64), (65, 74), (75, 100)]

report: dict = {}


# ----------------------------------------------------------------------------- utilitaires

def log(*a):
    print("[build-data]", *a, flush=True)


def download():
    RAW.mkdir(parents=True, exist_ok=True)
    for s in SOURCES:
        dest = RAW / s["file"]
        if dest.exists() and dest.stat().st_size > 0:
            continue
        log("téléchargement", s["url"])
        req = urllib.request.Request(s["url"], headers={"User-Agent": "Mozilla/5.0 (et-si build-data)"})
        with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)


def rows(wb, sheet):
    return list(wb[sheet].iter_rows(values_only=True))


def year_table(sheet_rows, header_row=1):
    """Feuille « âge en ligne, année en colonne » → {age:int: {year:int: value}}."""
    hdr = sheet_rows[header_row]
    years = {i: int(h) for i, h in enumerate(hdr) if isinstance(h, (int, float)) and i > 0}
    out: dict[int, dict[int, float]] = {}
    started = False
    for r in sheet_rows[header_row + 1:]:
        if isinstance(r[0], (int, float)) and not isinstance(r[0], bool):
            started = True
            out[int(r[0])] = {y: (float(r[i]) if isinstance(r[i], (int, float)) else None) for i, y in years.items()}
        elif started:
            break  # fin du premier bloc d'âges
    return out


def rnd(x, nd=6):
    if x == 0:
        return 0
    return float(f"{x:.{nd}g}")


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"écrit {name} ({p.stat().st_size / 1024:.0f} Ko)")


def is_dep_code(code) -> bool:
    """Vrai pour un code « REG-DEP » métropolitain (4 caractères, ex. '1175', 8415, '942A')."""
    return code is not None and len(str(code)) == 4 and not str(code).startswith("97")


def dep_from_code(code: str) -> str:
    """Code « REG-DEP » de DEP1/3/4 (ex. '1175', '942A') → code département."""
    return code[2:]


# ----------------------------------------------------------------------------- géographie

def build_meta():
    wb = openpyxl.load_workbook(RAW / "estim-pop-dep-sexe-aq-1975-2026.xlsx", read_only=True)
    deps = []
    for r in rows(wb, "2026"):
        if r[0] and isinstance(r[0], str) and len(r[0]) in (2, 3) and r[0][:2] != "97" and r[1]:
            if r[0].isdigit() or r[0] in ("2A", "2B"):
                deps.append({"code": r[0], "name": r[1]})
    assert len(deps) == 96, len(deps)

    # Région de chaque département : préfixe du code REG-DEP de DEP1.
    wb1 = openpyxl.load_workbook(RAW / "1_Pop_annu_compo_evol_depreg.xlsx", read_only=True)
    reg_of = {}
    for r in rows(wb1, "2023"):
        if r[1] and is_dep_code(r[1]):
            reg_of[dep_from_code(str(r[1]))] = str(r[1])[:2]
    for d in deps:
        d["reg"] = reg_of[d["code"]]

    wbo = openpyxl.load_workbook(RAW / "projections_scenario_central.xlsx", read_only=True)
    reg_names = {}
    for r in rows(wbo, "Population_REG"):
        if r[0] in METRO_REGIONS:
            reg_names[r[0]] = r[1]
    regions = [{"code": c, "name": reg_names[c]} for c in METRO_REGIONS]
    assert all(d["reg"] in reg_names for d in deps)
    return deps, regions


# ----------------------------------------------------------------------------- national (projections 2026)

def load_national():
    wb = openpyxl.load_workbook(RAW / "proj2026_central.xlsx", read_only=True, data_only=True)
    nat = {
        "popH": year_table(rows(wb, "populationH")),
        "popF": year_table(rows(wb, "populationF")),
        "fert": year_table(rows(wb, "hyp_fecondite")),
        "migH": year_table(rows(wb, "hyp_soldemigH")),
        "migF": year_table(rows(wb, "hyp_soldemigF")),
        "pop": year_table(rows(wb, "population")),
    }
    wbm = openpyxl.load_workbook(RAW / "proj2026_hyp_mortalite.xlsx", read_only=True, data_only=True)
    nat["qH"] = year_table(rows(wbm, "centralH"))
    nat["qF"] = year_table(rows(wbm, "centralF"))
    return nat


def single_age_shares(nat, sex, year):
    """Répartition nationale par âge simple au 1er janvier, regroupée 0..100+."""
    tab = nat["popH" if sex == 0 else "popF"]
    v = [0.0] * AGES
    for age, ys in tab.items():
        val = ys.get(year) or 0.0
        v[min(age, 100)] += val
    return v


def split_quinquennal(groups20, national):
    """20 classes (0-4 … 90-94, 95+) → 101 âges simples, selon le profil national intra-classe."""
    out = [0.0] * AGES
    for g, total in enumerate(groups20):
        lo = 5 * g
        hi = 100 if g == 19 else lo + 4
        ref = national[lo:hi + 1]
        s = sum(ref)
        for i, a in enumerate(range(lo, hi + 1)):
            out[a] = total * (ref[i] / s if s else 1 / len(ref))
    return out


def estimate_rows(year):
    wb = openpyxl.load_workbook(RAW / "estim-pop-dep-sexe-aq-1975-2026.xlsx", read_only=True)
    res = {}
    for r in rows(wb, str(year)):
        if r[0] and isinstance(r[0], str) and (r[0].isdigit() or r[0] in ("2A", "2B")) and r[0][:2] != "97":
            hom = [float(x) for x in r[23:43]]
            fem = [float(x) for x in r[44:64]]
            assert abs(sum(hom) - float(r[43])) < 1 and abs(sum(fem) - float(r[64])) < 1, r[0]
            res[r[0]] = (hom, fem)
    return res


def build_population(deps, nat, year):
    est = estimate_rows(year)
    shares = [single_age_shares(nat, 0, year), single_age_shares(nat, 1, year)]
    pop = []
    for d in deps:
        hom, fem = est[d["code"]]
        pop.append([[round(x) for x in split_quinquennal(hom, shares[0])],
                    [round(x) for x in split_quinquennal(fem, shares[1])]])
    return pop, est


# ----------------------------------------------------------------------------- mortalité

def e0(q):
    l, e = 1.0, 0.0
    for qx in q:
        qx = min(max(qx, 0.0), 1.0)
        d = l * qx
        e += l - d / 2
        l -= d
    return e + l * 1.0  # reliquat au-delà du dernier âge


def build_mortality(deps, nat, pops):
    years = list(range(START_YEAR, END_YEAR + 1))
    q = []  # q[sexe][annee][age] avec age = âge atteint dans l'année (0..100, 100 = 100+)
    for key in ("qH", "qF"):
        tab = nat[key]
        per_year = []
        for y in years:
            row = []
            for a in range(AGES):
                v = tab[a][y] if a < 100 else sum(tab[x][y] for x in range(100, 106)) / 6
                row.append(rnd(v / 100000))
            per_year.append(row)
        q.append(per_year)

    # Facteur départemental : multiplie les quotients nationaux pour reproduire l'écart
    # d'espérance de vie observé (DEP4, moyenne 2022-2024) entre le département et la métropole.
    wb = openpyxl.load_workbook(RAW / "4_Deces_mortalite_espvie_depreg.xlsx", read_only=True)
    obs: dict[str, list[tuple[float, float]]] = {}
    metro_obs = []
    years_obs = [y for y in (2022, 2023, 2024) if str(y) in wb.sheetnames]
    for y in years_obs:
        for r in rows(wb, str(y)):
            if not r[0]:
                continue
            name = str(r[0])
            if is_dep_code(r[1]) and isinstance(r[4], (int, float)):
                obs.setdefault(dep_from_code(str(r[1])), []).append((float(r[5]), float(r[4])))  # (H, F)
            elif name.strip().lower().startswith("france métropolitaine") and isinstance(r[4], (int, float)):
                metro_obs.append((float(r[5]), float(r[4])))
    metro = [sum(x[s] for x in metro_obs) / len(metro_obs) for s in (0, 1)]
    base_year_idx = years.index(2025)
    factors, gaps = [], []
    for d in deps:
        o = obs[d["code"]]
        f_sex = []
        g_sex = []
        for s in (0, 1):
            gap = sum(x[s] for x in o) / len(o) - metro[s]
            qn = q[s][base_year_idx]
            target = e0(qn) + gap
            lo, hi = 0.3, 3.0
            for _ in range(60):
                mid = (lo + hi) / 2
                if e0([x * mid for x in qn]) > target:
                    lo = mid
                else:
                    hi = mid
            f_sex.append(round((lo + hi) / 2, 4))
            g_sex.append(round(gap, 2))
        factors.append(f_sex)
        gaps.append(g_sex)

    # Calage sur les décès observés (standardisation indirecte) : les quotients nationaux portent
    # sur la France entière ; on ajuste chaque département pour que les décès attendus sur sa
    # population de 2023 et 2024 égalent les décès domiciliés observés (DEP4). L'écart
    # d'espérance de vie ne sert qu'à répartir l'ajustement entre hommes et femmes.
    def q_nat(s, a, y):
        tab = nat["qH" if s == 0 else "qF"]
        return (tab[a][y] if a < 100 else sum(tab[x][y] for x in range(100, 106)) / 6) / 100000

    observed = [0.0] * len(deps)
    expected = [0.0] * len(deps)
    idx = {d["code"]: i for i, d in enumerate(deps)}
    smr_years = [y for y in (2023, 2024) if y in pops and str(y) in wb.sheetnames]
    for y in smr_years:
        for r in rows(wb, str(y)):
            if is_dep_code(r[1]) and dep_from_code(str(r[1])) in idx and isinstance(r[2], (int, float)):
                observed[idx[dep_from_code(str(r[1]))]] += float(r[2])
        for di in range(len(deps)):
            for s in (0, 1):
                for a in range(AGES):
                    expected[di] += pops[y][di][s][a] * min(1.0, q_nat(s, min(a + 1, 100), y) * factors[di][s])
    smr = [observed[i] / expected[i] for i in range(len(deps))]
    factors = [[round(factors[i][s] * smr[i], 4) for s in (0, 1)] for i in range(len(deps))]
    report["mortality"] = {
        "dep4_years_e0": years_obs,
        "dep4_years_deaths": smr_years,
        "metro_e0_obs_HF": [round(x, 2) for x in metro],
        "national_e0_model_2025_HF": [round(e0(q[s][base_year_idx]), 2) for s in (0, 1)],
        "death_calibration_ratio_range": [round(min(smr), 3), round(max(smr), 3)],
        "death_calibration_ratio_metro": round(sum(observed) / sum(e / r for e, r in zip(expected, [1] * len(deps))), 4),
        "factor_range": [min(min(f) for f in factors), max(max(f) for f in factors)],
    }
    return {"years": years, "q": q, "depFactor": factors, "e0GapObs": gaps}


# ----------------------------------------------------------------------------- fécondité

FERT_GROUPS = [(12, 19), (20, 24), (25, 29), (30, 34), (35, 39), (40, 55)]


def build_fertility(deps, nat, pop2024):
    years = list(range(START_YEAR, END_YEAR + 1))
    ftab = nat["fert"]
    ages = [a for a in sorted(ftab) if 12 <= a <= 55]
    last_proj = max(y for y in ftab[ages[0]] if ftab[ages[0]][y] is not None)

    def f_nat(a, y):
        v = ftab.get(a, {}).get(min(y, last_proj))
        return (v or 0.0) / 10000

    rate = [[rnd(f_nat(a, y)) for a in range(AGES)] for y in years]  # par âge atteint dans l'année

    # Naissances 2024 par département de domicile de la mère et âge atteint dans l'année.
    con = duckdb.connect()
    births = con.sql(f"""
        select DEPDOMM as dep, try_cast(AGEMERE as int) as age, count(*) as n
        from '{(RAW / 'FD_NAIS_2024.parquet').as_posix()}'
        group by 1, 2
    """).fetchall()
    sexes = con.sql(f"""select SEXE, count(*) from '{(RAW / 'FD_NAIS_2024.parquet').as_posix()}' group by 1""").fetchall()
    sx = {k: v for k, v in sexes}
    boys_per_girl = sx.get("1", 0) / sx.get("2", 1)

    obs: dict[str, list[float]] = {}
    for dep, age, n in births:
        if age is None or dep not in {d["code"] for d in deps}:
            continue
        age = min(max(age, 12), 55)
        gi = next(i for i, (lo, hi) in enumerate(FERT_GROUPS) if lo <= age <= hi)
        obs.setdefault(dep, [0.0] * len(FERT_GROUPS))[gi] += n

    factors, icf_model = [], []
    for di, d in enumerate(deps):
        women = pop2024[di][1]  # femmes au 1/1/2024 par âge
        f = []
        for gi, (lo, hi) in enumerate(FERT_GROUPS):
            expected = 0.0
            for x in range(lo, hi + 1):
                # femme d'âge x-1 au 1er janvier atteint x dans l'année ; exposition approchée
                expected += f_nat(x, 2024) * women[x - 1]
            f.append(round(obs.get(d["code"], [0] * 6)[gi] / expected, 4) if expected > 0 else 1.0)
        factors.append(f)
        icf_model.append(round(sum(f_nat(x, 2024) * f[next(i for i, (lo, hi) in enumerate(FERT_GROUPS) if lo <= x <= hi)]
                                   for x in range(12, 56)), 3))

    # Contrôle : ICF départemental observé (DEP3, 2024).
    wb = openpyxl.load_workbook(RAW / "3_Naissances_natalite_fecondite_depreg.xlsx", read_only=True)
    icf_obs = {}
    for r in rows(wb, "2024"):
        if is_dep_code(r[1]) and isinstance(r[4], (int, float)):
            icf_obs[dep_from_code(str(r[1]))] = float(r[4])
    diffs = [abs(icf_model[i] - icf_obs[d["code"]]) for i, d in enumerate(deps) if d["code"] in icf_obs]
    report["fertility"] = {
        "national_icf_2024": round(sum(f_nat(a, 2024) for a in range(12, 56)), 3),
        "national_icf_2030": round(sum(f_nat(a, 2030) for a in range(12, 56)), 3),
        "projection_last_year": last_proj,
        "boys_per_girl_2024": round(boys_per_girl, 4),
        "icf_dep_model_vs_dep3_2024_mean_abs_diff": round(sum(diffs) / len(diffs), 3),
        "icf_dep_model_vs_dep3_2024_max_abs_diff": round(max(diffs), 3),
    }
    return {
        "years": years,
        "rate": rate,
        "groups": FERT_GROUPS,
        "depFactor": factors,
        "icf2024Model": icf_model,
        "icf2024Obs": [icf_obs.get(d["code"]) for d in deps],
        "boysPerGirl": round(boys_per_girl, 4),
    }


# ----------------------------------------------------------------------------- migrations internes

def build_internal_migration(deps):
    codes = [d["code"] for d in deps]
    idx = {c: i for i, c in enumerate(codes)}
    f = (RAW / "RP2022_migcom.parquet").as_posix()
    con = duckdb.connect()
    dep_expr = "case when substr({c},1,2) in ('97') then substr({c},1,3) else substr({c},1,2) end"
    q = f"""
        with t as (
          select {dep_expr.format(c='COMMUNE')} as cur,
                 case when IRAN in ('0','1','2','3') then {dep_expr.format(c='COMMUNE')}
                      when IRAN in ('4','5') then {dep_expr.format(c='DCRAN')}
                      else null end as prev,
                 cast(SEXE as int) - 1 as sex,
                 least(cast(AGEREVQ as int), 95) as ag,
                 IPONDI as w
          from '{f}' where METRODOM = 'M'
        )
        select prev, cur, sex, ag, sum(w) from t where prev is not null group by 1,2,3,4
    """
    log("agrégation des migrations résidentielles (MIGCOM 2022)…")
    data = con.sql(q).fetchall()
    n = len(codes)
    ng = 20  # classes quinquennales 0-4 … 95+
    stock = [[[0.0] * ng for _ in range(2)] for _ in range(n)]
    out = [[[0.0] * ng for _ in range(2)] for _ in range(n)]
    flows = [[[0.0] * n for _ in range(n)] for _ in DEST_GROUPS]
    for prev, cur, sex, ag, w in data:
        if prev not in idx or cur not in idx:
            continue
        o, dd, g = idx[prev], idx[cur], ag // 5
        stock[o][sex][g] += w
        if o != dd:
            out[o][sex][g] += w
            age_mid = ag + 2
            bg = next(i for i, (lo, hi) in enumerate(DEST_GROUPS) if lo <= age_mid <= hi)
            flows[bg][o][dd] += w
    rate = [[[rnd(out[o][s][g] / stock[o][s][g], 4) if stock[o][s][g] else 0 for g in range(ng)]
             for s in (0, 1)] for o in range(n)]
    dest = []
    kept_share = []
    for bg in range(len(DEST_GROUPS)):
        per_o = []
        for o in range(n):
            tot = sum(flows[bg][o])
            pairs = [(dd, flows[bg][o][dd] / tot) for dd in range(n) if tot and flows[bg][o][dd] / tot >= 0.0005]
            s = sum(p for _, p in pairs)
            kept_share.append(s)
            pairs = sorted(pairs, key=lambda x: -x[1])
            per_o.append([[dd, rnd(p / s, 4)] for dd, p in pairs])
        dest.append(per_o)
    total_movers = sum(sum(sum(x) for x in out[o]) for o in range(n))
    total_stock = sum(sum(sum(x) for x in stock[o]) for o in range(n))
    report["internalMigration"] = {
        "movers_between_departments_per_year": round(total_movers),
        "share_of_population": round(total_movers / total_stock, 4),
        "dest_share_kept_min": round(min(kept_share), 4),
    }
    return {"ageGroupWidth": 5, "rate": rate, "destGroups": DEST_GROUPS, "dest": dest}, out, stock


# ----------------------------------------------------------------------------- migrations extérieures

def build_external_migration(deps, nat, mig_out, internal, metro_pop_2025):
    codes = [d["code"] for d in deps]
    idx = {c: i for i, c in enumerate(codes)}
    n = len(codes)
    # Solde interne net par département implicite dans les taux (en personnes / an, recensement 2022).
    net_internal = [0.0] * n
    for o in range(n):
        outs = sum(sum(x) for x in mig_out[o])
        net_internal[o] -= outs
    # Entrées : redistribuer les sorties selon les matrices (classes larges).
    for o in range(n):
        for s in (0, 1):
            for g in range(20):
                movers = mig_out[o][s][g]
                if not movers:
                    continue
                age_mid = g * 5 + 2
                bg = next(i for i, (lo, hi) in enumerate(DEST_GROUPS) if lo <= age_mid <= hi)
                for dd, p in internal["dest"][bg][o]:
                    net_internal[dd] += movers * p

    wb = openpyxl.load_workbook(RAW / "1_Pop_annu_compo_evol_depreg.xlsx", read_only=True)
    years = [y for y in range(2017, 2024) if str(y) in wb.sheetnames]
    apparent = [0.0] * n
    for y in years:
        for r in rows(wb, str(y)):
            if is_dep_code(r[1]) and dep_from_code(str(r[1])) in idx and isinstance(r[8], (int, float)):
                apparent[idx[dep_from_code(str(r[1]))]] += (float(r[8]) - float(r[7])) / len(years)
    residual = [apparent[i] - net_internal[i] for i in range(n)]
    total_res = sum(residual)
    weights_residual = [rnd(r / total_res, 5) for r in residual]

    # Variante observée : arrivées depuis l'étranger, un DOM ou une COM (recensement 2022).
    f = (RAW / "RP2022_migcom.parquet").as_posix()
    con = duckdb.connect()
    inflow = dict(con.sql(f"""
        select substr(COMMUNE,1,2) as dep, sum(IPONDI) from '{f}'
        where METRODOM = 'M' and IRAN in ('6','7','8','9') group by 1
    """).fetchall())
    tot_in = sum(inflow.get(c, 0) for c in codes)
    weights_inflow = [rnd(inflow.get(c, 0) / tot_in, 5) for c in codes]
    weights = weights_inflow if EXTERNAL_WEIGHTS == "inflow" else weights_residual

    # Niveau national et profil par âge (projections 2026, France entière).
    # Part de la métropole : part de sa population dans la France entière au 1/1/2025 (hypothèse).
    nat_years = list(range(START_YEAR, END_YEAR + 1))
    last = max(y for y in nat["migH"][20] if nat["migH"][20][y] is not None)
    fr_total = sum((nat["popH"][a].get(START_YEAR) or 0) + (nat["popF"][a].get(START_YEAR) or 0) for a in nat["popH"])
    metro_share = metro_pop_2025 / fr_total
    metro_share_used = metro_share
    profile, level = [], []
    for y in nat_years:
        yy = min(y, last)
        vals = [[0.0] * AGES, [0.0] * AGES]
        for s, key in ((0, "migH"), (1, "migF")):
            for a, ys in nat[key].items():
                vals[s][min(a, 100)] += ys.get(yy) or 0.0
        tot = sum(vals[0]) + sum(vals[1])
        level.append(round(tot * metro_share_used))
        profile.append([[rnd(v / tot, 4) if tot else 0 for v in vals[s]] for s in (0, 1)])
    report["externalMigration"] = {
        "dep1_years": years,
        "method": EXTERNAL_WEIGHTS,
        "metro_residual_external_per_year": round(total_res),
        "metro_share_of_population_2025": round(metro_share, 4),
        "level_2030": level[nat_years.index(2030)],
        "negative_weight_departments": [codes[i] for i in range(n) if residual[i] < 0],
    }
    return {
        "years": nat_years,
        "level": level,
        "profile": profile,
        "depWeight": weights,
        "depWeightResidual": weights_residual,
        "depWeightInflow": weights_inflow,
        "method": EXTERNAL_WEIGHTS,
        "apparentNet": [round(x) for x in apparent],
        "internalNet": [round(x) for x in net_internal],
        "metroShare": round(metro_share_used, 4),
    }


# ----------------------------------------------------------------------------- références

def build_reference(deps, nat, est2026):
    codes = [d["code"] for d in deps]
    years = list(range(START_YEAR, 2071))
    # National (France entière, y compris DROM) : total et structure par âge.
    tot, young, adult, old = [], [], [], []
    for y in years:
        v = [0.0] * 121
        for tab in (nat["popH"], nat["popF"]):
            for a, ys in tab.items():
                v[min(a, 120)] += ys.get(y) or 0.0
        t = sum(v)
        tot.append(round(t))
        young.append(rnd(sum(v[:20]) / t, 4))
        adult.append(rnd(sum(v[20:65]) / t, 4))
        old.append(rnd(sum(v[65:]) / t, 4))

    wb = openpyxl.load_workbook(RAW / "projections_scenario_central.xlsx", read_only=True)
    r_ = rows(wb, "Population_DEP")
    hdr = r_[5]
    ycols = {int(str(h).split("_")[1]): i for i, h in enumerate(hdr) if isinstance(h, str) and h.startswith("POP_")}
    omphale_years = [y for y in range(2025, 2071, 5)]
    by_dep = {row[0]: [float(row[ycols[y]]) * 1000 for y in omphale_years] for row in r_[6:] if row[0] in codes}
    omphale = [[round(x) for x in by_dep[c]] for c in codes]

    est = [round(sum(est2026[c][0]) + sum(est2026[c][1])) for c in codes]
    return {
        "national": {"source": "Insee, projections de population 2026, scénario central (France entière)",
                     "years": years, "total": tot, "share0_19": young, "share20_64": adult, "share65plus": old},
        "omphale": {"source": "Insee, Omphale 2022, scénario central (départements)", "years": omphale_years, "pop": omphale},
        "estimate2026": {"source": "Insee, estimations de population au 1er janvier 2026", "pop": est},
    }


# ----------------------------------------------------------------------------- principal

def main():
    if "--download" in sys.argv:
        download()
    missing = [s["file"] for s in SOURCES if not (RAW / s["file"]).exists()]
    if missing:
        sys.exit(f"Fichiers manquants dans {RAW} : {missing}. Lancez avec --download.")

    deps, regions = build_meta()
    nat = load_national()

    pop2025, _ = build_population(deps, nat, 2025)
    pop2024, _ = build_population(deps, nat, 2024)
    pop2023, _ = build_population(deps, nat, 2023)
    _, est2026 = build_population(deps, nat, 2026)

    mortality = build_mortality(deps, nat, {2023: pop2023, 2024: pop2024})
    fertility = build_fertility(deps, nat, pop2024)
    internal, mig_out, _ = build_internal_migration(deps)
    metro_pop_2025 = sum(sum(sum(s) for s in d) for d in pop2025)
    external = build_external_migration(deps, nat, mig_out, internal, metro_pop_2025)
    reference = build_reference(deps, nat, est2026)

    meta = {
        "version": 1,
        "startYear": START_YEAR,
        "endYear": END_YEAR,
        "officialHorizon": 2070,
        "departments": deps,
        "regions": regions,
        "status": {
            "population": "Effectifs par classe quinquennale : observés (estimations Insee au 1/1/2025). Répartition par âge simple : estimée selon le profil national.",
            "mortality": "Quotients nationaux : hypothèses Insee 2026. Écart départemental : estimé (calé sur l'espérance de vie observée).",
            "fertility": "Taux nationaux : hypothèses Insee 2026. Écart départemental : estimé (calé sur les naissances 2024).",
            "internalMigration": "Taux et destinations observés au recensement 2022 (moyenne annuelle), supposés constants.",
            "externalMigration": "Niveau national : hypothèse Insee 2026. Répartition par département : estimée (solde apparent DEP1 moins migrations internes).",
            "after2070": "Au-delà de 2070 : fécondité et migrations prolongées au niveau 2070 (hypothèse du jeu) ; mortalité selon les hypothèses Insee jusqu'en 2125.",
        },
    }
    population = {"year": START_YEAR, "pop": pop2025}

    write("meta.json", meta)
    write("population.json", population)
    write("mortality.json", mortality)
    write("fertility.json", fertility)
    write("migration_internal.json", internal)
    write("migration_external.json", external)
    write("reference.json", reference)
    write("build-report.json", report)
    write("sources.json", SOURCES)
    log(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
