# DECISIONS — « Et si… ? »

Journal des hypothèses du modèle, des choix techniques et des limites connues. Chaque valeur qui n'est pas lue telle quelle dans une source est qualifiée d'**estimée**, ici comme dans l'interface.

Dernière mise à jour : jalon 2 (4 octobre 2026).

---

## 1. Périmètre

- France métropolitaine : 96 départements regroupés en 13 régions. Les DROM sont prévus dans un jalon optionnel.
- Pas annuel, du 1er janvier 2025 au 1er janvier 2100. Chaque département est découpé par sexe et par âge simple de 0 à 100 ans, la case 100 regroupant les 100 ans et plus.
- Point de départ : estimations Insee au 1er janvier 2025. Le 1er janvier 2026 sert de contrôle à un an.

## 2. Scénario de référence (décision validée : « hybride »)

| Composante | Hypothèse nationale | Variation entre départements |
|---|---|---|
| Mortalité | Quotients par sexe et âge du **scénario central des projections Insee 2026** (fichier « hypothèses de mortalité », publié jusqu'en 2125, donc officiel jusqu'en 2100) | Facteur départemental constant (estimé, § 3.2) |
| Fécondité | Taux par âge du scénario central Insee 2026 : ICF 1,61 en 2024, puis 1,45 à partir de 2028 | Facteur par département et classe d'âge de la mère, calé sur les naissances 2024 (estimé, § 3.3) |
| Migrations internes | — | Taux de départ et destinations observés au recensement 2022, constants (§ 3.4) |
| Solde extérieur | Solde par sexe et âge du scénario central Insee 2026 (+150 000 par an pour la France entière à partir de 2026), multiplié par la part de la métropole dans la population (0,967) | Répartition « résiduelle » (estimée, § 3.5) |

**Après 2070** (décision validée) : l'Insee ne publie plus de fécondité ni de migrations. Leurs niveaux de 2070 sont prolongés jusqu'en 2100 ; la mortalité continue de suivre les hypothèses Insee. Les graphiques hachurent cette période (« au-delà des projections officielles »).

## 3. Méthode (méthode des composantes)

Pour l'année y, du 1er janvier y au 1er janvier y+1 :

1. **Survie et vieillissement :** P(a+1, y+1) = P(a, y) × (1 − q(a+1, y)), avec les quotients « par âge atteint dans l'année ». Le groupe 100+ est ouvert, avec un quotient égal à la moyenne des âges 100 à 105.
2. **Naissances :** Σ femmes d'âge a × f(a+1, y) × (1 − q/2). Les nouveau-nés se répartissent à 51,26 % de garçons (1,0519 garçon par fille, état civil 2024), puis survivent avec q(0, y).
3. **Migrations internes :** départs = population × taux de départ (département, sexe, classe quinquennale). Ils sont répartis vers les destinations observées par grande classe d'âge (9 classes).
4. **Solde extérieur :** niveau national × poids du département × profil national par sexe et âge.

La fonction `simulate(data, scénario, catalogue)` est pure et déterministe. L'option « aléa » applique, avec une graine (mulberry32), un bruit lognormal d'espérance 1 :

- sur la fécondité : 4 % national et 2 % départemental (× intensité de l'aléa) ;
- sur la mortalité : mêmes écarts-types ;
- sur les migrations : 8 % et 4 %.

### 3.1 Âge simple par département (estimé)

Les estimations départementales de l'Insee existent par classes de 5 ans, pas par âge simple. Chaque classe est répartie en âges simples selon le **profil national par âge simple** de la même année (projections 2026, population au 1er janvier). Les effectifs par classe quinquennale restent exactement ceux de l'Insee.

### 3.2 Mortalité départementale (estimée)

1. Un facteur par sexe est calé pour que l'écart d'espérance de vie à la naissance entre le département et la métropole égale celui observé (DEP4, moyenne 2022-2024).
2. Ce facteur est ensuite multiplié par un rapport décès observés / décès attendus (standardisation indirecte, DEP4 2023-2024). Le moteur reproduit ainsi le nombre de décès de chaque département.

Ce calage corrige un biais : les quotients nationaux portent sur la France entière, DROM inclus. Sans lui, la métropole comptait environ 10 000 décès de trop par an (644 000 au lieu d'environ 634 000 en 2025).

- Rapport métropolitain : 0,985.
- Rapports départementaux : de 0,93 à 1,05.
- Facteurs finaux : de 0,76 à 1,29.

### 3.3 Fécondité départementale (estimée)

Facteur = naissances 2024 observées (fichier détail, domicile de la mère) ÷ naissances attendues avec les taux nationaux 2024, par classe d'âge de la mère : moins de 20 ans, 20-24, 25-29, 30-34, 35-39, 40 ans et plus.

Contrôle : l'ICF départemental du modèle s'écarte de l'ICF publié (DEP3, 2024) de **0,008 enfant par femme en moyenne**, au plus de 0,033.

L'évolution dans le temps suit le rapport des taux nationaux d'une année sur ceux de 2024, âge par âge, ce qui capte aussi le recul de l'âge à la maternité.

### 3.4 Migrations internes

Elles proviennent du recensement 2022 (fichier MIGCOM : commune de résidence actuelle et commune de résidence un an avant).

- Environ 1,73 million de personnes changent de département chaque année, soit 2,7 % de la population.
- Les destinations qui pèsent moins de 0,05 % des départs d'un département sont écartées, puis les parts restantes renormalisées (au moins 99,5 % des flux sont conservés).
- **Simplification de performance :** dans le moteur, les arrivées sont cumulées par destination × sexe × grande classe d'âge, puis réparties par âge simple selon le profil national des migrants de l'année. Les effectifs par âge sont conservés exactement au niveau national, ce que vérifie un test.

### 3.5 Solde migratoire extérieur par département (estimé)

Deux méthodes ont été comparées. Les écarts portent sur la population projetée.

| Méthode | Écart à un an (moyen / max) | Écart des parts départementales à Omphale en 2050 |
|---|---|---|
| Arrivées de l'étranger, d'un DOM ou d'une COM observées au recensement 2022 | 0,21 % / 0,92 % | 4,7 % |
| **Résidu** : solde apparent (DEP1, moyenne 2017-2023) − solde interne implicite du recensement | **0,13 % / 0,40 %** | **3,5 %** |

La méthode **résiduelle** est retenue. Limite : 33 départements, surtout ruraux, ont un poids négatif, c'est-à-dire un solde extérieur net négatif, qui s'applique au profil par âge national. Aucun effectif négatif n'apparaît en pratique (troncature contrôlée : 0 personne).

## 4. Validation (mesurée automatiquement, `tests/engine/validation.test.ts`)

Valeurs au jalon 1 (écart = moteur − officiel) :

| Contrôle | Mesure | Seuil du test |
|---|---|---|
| Indice d'évolution de la population (base 2025), moteur en métropole contre Insee 2026 pour la France entière | −0,11 pt (2026), −0,72 pt (2050), **−1,06 pt (2070)** | 1,5 pt |
| Part des 65 ans et plus | +0,19 pt (2030), +0,23 pt (2050), +0,43 pt (2070) | 1,5 pt |
| Population au 1/1/2026 contre estimations Insee, par département | 0,13 % en moyenne, 0,40 % au plus (Corse-du-Sud) | 0,3 % / 1 % |
| Parts départementales contre Omphale 2022 | 1,7 % (2030), 3,5 % (2050), 5,1 % (2070) en moyenne ; maximum en Corse-du-Sud (+20 % en 2070) | 2,5 / 5 / 7 % |

**Lecture.** La référence perd un peu plus d'habitants que la projection officielle (−1,06 point en 2070). L'Insee projette la France entière, DROM compris, où la croissance est plus rapide (Mayotte, Guyane) ; une partie de l'écart vient de là, et la projection 2026 n'est pas publiée pour la métropole seule. L'écart à Omphale grandit avec le temps : Omphale 2022 part de 2018, avec une fécondité de 1,8 et un solde extérieur de +70 000 par an, et ses migrations internes datent de 2013-2018. On ne cherche pas à le réduire au-delà des seuils.

## 5. Indicateurs dérivés (ratios simples, estimés)

| Indicateur | Définition |
|---|---|
| Seniors pour 100 actifs | 65 ans et plus / 20-64 ans × 100 |
| Actifs par senior | 20-64 ans / 65 ans et plus |
| Pression sur les retraites | 64 ans et plus / 20-63 ans × 100 (âge pivot pris à 64 ans) |
| Places d'école | Enfants de 3 à 10 ans au 1er janvier (maternelle et élémentaire, scolarisation ≈ 100 %) |
| Places en EHPAD | 85 ans et plus × 0,20. Hypothèse de jeu (≈ 1 sur 5), ordre de grandeur à rapprocher des enquêtes EHPA de la DREES, **non vérifiée précisément** |
| Densité | Population / superficie calculée sur les contours simplifiés (547 339 km², valeur approchée) |

## 6. Choix techniques

| Choix | Raison |
|---|---|
| Python + DuckDB pour `build-data` | Lecture directe des fichiers parquet du recensement (MIGCOM : 184 Mo) et de l'état civil, en quelques secondes |
| Environnement Python isolé (`.venv-data`) | Aucune installation sur le système |
| JSON versionnés dans `public/data` (décision validée) | `npm run dev` fonctionne sans télécharger les 200 Mo de sources |
| Moteur en tableaux typés à plat | 96 × 2 × 101 cellules, 75 pas : **≈ 70 ms** par simulation (médiane de 5 passages, test `performance.test.ts`), sous la cible de 200 ms |
| Constantes copiées localement dans `simulate.ts` | Sous Vitest, les imports deviennent des accès de propriétés et la boucle était 5 fois plus lente (330 ms) |
| Web Worker + Comlink | L'interface ne bloque jamais ; les résultats sont transférés sans copie |
| D3 (scales, shapes, geo) rendu en JSX | Contrôle total de l'accessibilité (ARIA, tableaux alternatifs) |
| Polices auto-hébergées (@fontsource) | Pas d'appel à Google Fonts, fonctionne hors ligne |
| Design system composé à la main | Le générateur `--design-system` du skill ui-ux-pro-max proposait « Cyberpunk UI », hors sujet (voir `design-system/MASTER.md`) |

## 7. Limites connues

- Les taux de migration interne, les destinations et la répartition du solde extérieur sont **constants** (observés vers 2022). Le jeu fait varier ces hypothèses ; la référence ne les fait pas évoluer d'elle-même.
- La fécondité et la mortalité départementales gardent le même écart relatif à la moyenne nationale sur tout l'horizon.
- Les quotients et taux nationaux sont ceux de la France entière ; seul l'écart propre à chaque département est calé sur la métropole.
- L'âge simple départemental est reconstruit à partir de classes quinquennales (§ 3.1).
- Aucun ajustement du recensement n'est fait (l'Insee « ajuste » ses estimations ; pas le moteur).
- Au-delà de 2070, les hypothèses sont prolongées par le jeu.

## 8. Interface — jalon 2 (carte, frise, lecture)

| Choix | Raison |
|---|---|
| Carte SVG D3-geo, projection conique conforme (parallèles 44° et 49°, proche de Lambert-93) | 96 polygones : le SVG suffit et rend chaque département cliquable et lisible ; pas besoin de fond de carte tuilé (MapLibre écarté) |
| Échelles en **9 classes fixes sur 2025-2100** | Une couleur garde le même sens pendant toute la lecture. Couches signées : divergente bleu/orange + **hachures sur les baisses** ; couches de niveau : séquentielle cividis |
| Flux migratoires sur un `<canvas>` superposé | Particules animées sans alourdir le DOM. On montre les ~36 flux **nets** qui maximisent volume × √distance, en écartant les voisins immédiats, qui satureraient l'Île-de-France. Mouvement réduit : flèches fixes |
| Navigation clavier de la carte | La carte est un seul arrêt de tabulation (`role="application"`) : flèches = département voisin dans la direction (cône de ±60°), Entrée = choisir, Échap = France. Annonce vocale du département et de la valeur. Alternative : menu « Choisir une autre zone » |
| Frise = `input type="range"` natif | Clavier (flèches, Début, Fin, Page préc./suiv.) et lecteurs d'écran gratuits ; lecture à 2 ans/s × vitesse (×1, ×2, ×4) |
| Téléphone | La carte reste plein écran, le panneau d'analyse devient un tiroir (Échap, voile, focus rendu) et la légende se replie en bandeau de couleurs |
| Thème clair / sombre / automatique | Mémorisé localement ; les couleurs des données ont une variante par thème, avec un contraste AA vérifié par axe-core dans les tests |
| Libellés sans jargon | « Seniors pour 100 actifs », « Arrivées moins départs » ; le terme technique s'affiche au survol et au focus (`Term`) |

Limite : les flux affichés sont des flux **nets** de l'année ; les flux bruts, bien plus nombreux, ne sont pas représentés.
