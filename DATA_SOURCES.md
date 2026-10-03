# DATA_SOURCES — sources des données

Toutes les données proviennent de l'Insee et de l'IGN, sous **Licence Ouverte / Etalab 2.0**. Le script `npm run data` (`scripts/build-data/`) télécharge les fichiers listés ci-dessous dans `.cache/raw/`, les nettoie et produit les JSON compacts de `public/data/`. Le catalogue exact (URL de chaque fichier) est dans `scripts/build-data/sources.py` ; l'application l'affiche via `public/data/sources.json`.

| Fichier source | Producteur, date | Usage dans le jeu | Page |
|---|---|---|---|
| `estim-pop-dep-sexe-aq-1975-2026.xlsx` — estimations de population par département, sexe et âge quinquennal | Insee, 13/01/2026 | Population de départ au 1/1/2025 ; contrôle au 1/1/2026 | https://www.insee.fr/fr/statistiques/8721456 |
| `1_Pop_annu_compo_evol_depreg.xlsx` — DEP1, population et composantes de l'évolution | Insee, 15/06/2026 | Solde migratoire apparent par département (2017-2023) | https://www.insee.fr/fr/statistiques/8999023 |
| `3_Naissances_natalite_fecondite_depreg.xlsx` — DEP3 | Insee, 15/06/2026 | Contrôle de l'ICF départemental 2024 | https://www.insee.fr/fr/statistiques/8999023 |
| `4_Deces_mortalite_espvie_depreg.xlsx` — DEP4 | Insee, 15/06/2026 | Espérance de vie (2022-2024) et décès (2023-2024) par département | https://www.insee.fr/fr/statistiques/8999023 |
| `FD_NAIS_2024.parquet` — naissances 2024, fichier détail de l'état civil | Insee, 2025 | Naissances par âge de la mère et département de domicile ; rapport de masculinité | https://www.insee.fr/fr/statistiques/8610295 |
| `RP2022_migcom.parquet` — migrations résidentielles, commune actuelle et commune un an avant (fichier détail) | Insee, recensement 2022, 2025 | Taux de départ et destinations entre départements, par sexe et âge | https://www.insee.fr/fr/statistiques/8589767 |
| `00_central.xlsx` — projections de population 2026 pour la France, scénario central | Insee, 08/06/2026 | Fécondité, solde migratoire et population nationale (validation) | https://www.insee.fr/fr/statistiques/8990852?sommaire=8991068 |
| `hyp_mortalite.xlsx` — projections 2026, hypothèses de mortalité jusqu'en 2125 | Insee, 08/06/2026 | Quotients de mortalité par sexe et âge, 2025-2100 | https://www.insee.fr/fr/statistiques/8990899?sommaire=8991068 |
| `projections_scenario_central.xlsx` — projections Omphale 2018-2070 pour les départements et régions | Insee, 24/11/2022 | Validation de la répartition entre départements ; noms des régions | https://www.insee.fr/fr/statistiques/6652134 |
| `departements-version-simplifiee.geojson` — contours simplifiés des départements | IGN Admin Express COG, simplification france-geojson | Fond de carte, superficies approchées | https://github.com/gregoiredavid/france-geojson |

## Fichiers produits (`public/data/`)

| Fichier | Contenu |
|---|---|
| `meta.json` | Départements, régions, statut de chaque famille de données (observé, estimé, prolongé) |
| `population.json` | Population au 1/1/2025 [département][sexe][âge 0-100] |
| `mortality.json` | Quotients nationaux 2025-2100 et facteurs départementaux |
| `fertility.json` | Taux nationaux 2025-2100 et facteurs départementaux, ICF modèle et observé |
| `migration_internal.json` | Taux de départ et matrices de destination (creuses) |
| `migration_external.json` | Niveau, profil par âge et poids départementaux du solde extérieur |
| `reference.json` | Références de validation (Insee 2026, Omphale, estimations 2026) |
| `departements.topo.json`, `areas.json` | Contours TopoJSON et superficies |
| `build-report.json` | Contrôles chiffrés produits par le script |
| `sources.json` | Ce catalogue, pour l'application |
