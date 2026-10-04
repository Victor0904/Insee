# DECISIONS — « Et si… ? »

Journal des hypothèses du modèle, des choix techniques et des limites connues. Chaque valeur qui n'est pas lue telle quelle dans une source est qualifiée d'**estimée**, ici comme dans l'interface.

Dernière mise à jour : améliorations après le jalon 6 (4 octobre 2026).

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

## 9. Événements — jalon 3

### Bibliothèque

25 événements déclaratifs (`src/events/library.ts`) : 22 proposés dans la bibliothèque, couvrant les 6 familles demandées, et 3 qui n'apparaissent qu'en conséquence d'un autre (rattrapage des naissances, migration vers le nord, tension sur le logement).

- Les effets sont donnés pour une intensité « forte » (1) et mis à l'échelle par l'intensité choisie : faible 0,3, moyenne 0,6, forte 1, extrême 1,5.
- **Toutes les valeurs sont des hypothèses de jeu**, marquées `estimated: true` et affichées « valeurs estimées » dans la fiche. Quand un ordre de grandeur historique existe, il est cité :
  - pandémie : +9 % de décès en 2020, Insee ;
  - canicule : environ 15 000 décès en excès en août 2003, Inserm ;
  - ouverture et fermeture migratoires : comparées aux scénarios de l'Insee.
- Les zones prédéfinies (littoral, Sud, Nord, métropoles, diagonale du vide…) sont des listes de travail du jeu (`src/events/zones.ts`). La « diagonale du vide » n'a pas de définition officielle : la liste de 18 départements est indicative.
- La « retraite à 67 ans » ne change pas la population, seulement l'indicateur « pression sur les retraites » (nouvel effet `retirementAge`).

### Cascades

Elles sont **déterministes** et dépendent seulement de la frise, pas des résultats. Une règle déclenche un événement dérivé après N années actives du parent, au-dessus d'une intensité minimale ; la profondeur maximale est de 3. Chaque événement dérivé garde `causedBy`.

L'interface rend ces cascades visibles et explicables :
- sur la frise : bloc pointillé avec « ↳ » ;
- dans la fiche : « Effets en cascade : … » et la phrase « parce que » ;
- dans le récit : « conséquence de … ».

Exemple testé : canicules à répétition → crise agricole → migration vers le nord → tension sur le logement.

### Interaction

| Choix | Raison |
|---|---|
| Glisser-déposer maison (événements de pointeur) | Souris et tactile ; seuil de 5 px pour qu'un clic reste un clic ; dépôt sur un département (zone) ou sur la frise (date) |
| Alternative sans glisser : bouton « Placer » | Ouvre un bandeau : clic ou Entrée sur un département, ou bouton « zone conseillée », « Toute la France », zone sélectionnée (WCAG 2.2, 2.5.7) |
| Blocs de la frise | Glisser pour déplacer, poignée de droite pour la durée ; au clavier : flèches = début, Maj+flèches = durée, Suppr = retirer, Entrée = régler |
| Fiche de réglage non modale | La carte reste visible et se met à jour pendant le réglage ; les curseurs passent par un **aperçu** non historisé, enregistré au relâchement |
| Historique illimité (zundo) | Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z, menu « Historique » avec retour à une étape ; seuls le scénario et le libellé de l'action sont historisés |
| Simulation en continu | Un seul calcul à la fois dans le Worker ; si le scénario change pendant un calcul, seule la dernière version est recalculée (~70 ms) |
| Carte en « Écart avec la référence » au premier événement | Montre tout de suite l'effet ; ce basculement automatique n'a plus lieu dès que le joueur a choisi une couche lui-même |
| Éditeur d'événement personnalisé | Curseurs sans jargon (naissances, décès, « des gens partent vers… », arrivées de l'étranger, « qui est concerné ? ») ; l'événement créé rejoint « Mes événements » |

### Récit automatique (`src/story/narrative.ts`)

Le récit choisit les 3 changements les plus marquants de la zone par rapport à la référence. À l'échelle de la France, il compare les régions ; pour une région, ses départements.

Chaque phrase donne :
1. l'écart (en % et en habitants) ;
2. la tranche d'âge qui pèse le plus ;
3. la composante cumulée dominante (naissances, décès, arrivées, départs, étranger) ;
4. pour les migrations, la **région d'origine ou de destination** principale, tirée des flux simulés comparés à la référence ;
5. l'événement le plus probablement en cause.

Exemple réel : « Bretagne : + 4,5 % d'habitants (+ 163 781) par rapport à la référence en 2050, surtout des 45-64 ans, venus surtout d'Île-de-France, après « Télétravail généralisé » (2027). »

**Limite :** dans le récit, l'attribution à un événement reste heuristique (zone, type d'effet, intensité). La part exacte de chaque événement est donnée par « D'où vient cet écart ? » (§ 10).

## 10. Analyse — jalon 4

### « D'où vient cet écart ? » (`src/engine/decompose.ts`)

Un clic sur n'importe quel chiffre du panneau ouvre l'explication pour la zone et l'année affichées. Elle comporte deux parties.

1. **Composantes.** L'écart de population à la référence est la somme exacte des écarts cumulés depuis 2025 :

   Δpop = Δnaissances − Δdécès + Δarrivées − Δdéparts + Δétranger

   Le reste non expliqué est vérifié par les tests : il est inférieur à 0,01 % de l'écart. À l'échelle de la France, arrivées et départs internes se compensent : on les affiche regroupés.
2. **Part de chaque événement**, par **contrefactuel** : le Worker recalcule le scénario privé de chaque événement, et donc de ses cascades, puis ne transfère que les totaux par département et par année (≈ 30 Ko par événement). La différence avec le scénario complet est la part de l'événement. Le reste est affiché tel quel en « effets croisés ». Le calcul coûte une simulation par événement (≈ 70 ms chacune) ; il est fait à la demande et mis en cache par scénario.

Pour un indicateur autre que la population (âge médian, seniors pour 100 actifs…), on affiche sa valeur comparée à la référence, puis la décomposition de l'écart de population, qui en est le moteur.

### Visualisations

| Élément | Choix |
|---|---|
| Indicateurs clés | Écart à la référence écrit avec son signe ; bleu = plus que la référence, orange = moins (la même règle partout, carte comprise) ; mention « estimé » sur les ratios du jeu (EHPAD, places d'école, pression sur les retraites) |
| Pyramide des âges | Âge simple, hommes à gauche et femmes à droite ; scénario en plein, référence en contour pointillé ; **échelle fixe sur 2025-2100** pour voir la pyramide se transformer pendant la lecture ; transition du tracé coupée sous mouvement réduit ; tableau alternatif par tranches de 10 ans |
| Courbes | 10 indicateurs au choix, scénario contre référence, curseur de l'année, période hachurée après 2070 |
| Petits multiples | 13 régions, **même échelle** pour toutes (évolution depuis 2025), écart en points ; un clic affiche la région |
| Avant / après | Deux cartes superposées, la seconde découpée par un séparateur (`clip-path`) réglable à la souris ou au clavier (curseur natif). On compare référence et scénario à la même année, ou 2025 et l'année affichée. La carte d'arrière-plan est décorative (ni focus ni annonce) |
| Onglets | Motif ARIA « tabs » : flèches, Début, Fin |

## 11. Modes de jeu et prise en main — jalon 5

### Correction du modèle : arrivées de l'étranger proportionnelles

L'effet `external` était un nombre absolu de personnes par an. Posé sur un petit département, il devenait absurde : « Ouverture migratoire » sur la seule Creuse lui ajoutait 150 000 personnes par an, soit 7 millions d'habitants en 2100.

Il est désormais exprimé en **fraction de la population de la zone par an** :
- « Ouverture migratoire » : 0,23 % par an, soit environ 150 000 personnes pour la France entière ;
- « Boom technologique » : 0,2 % ;
- « Relocalisation » : 0,1 %.

L'éditeur personnalisé propose de −0,5 % à +1 % par an.

### Défis (`src/game/challenges.ts`)

9 défis, chacun avec un objectif chiffré, une année, un nombre maximal d'événements, d'éventuels événements interdits ou imposés, et un indice. L'exemple de la mission, « plus de 1,5 actif par senior en 2070 », est **déjà atteint par la référence** (1,59) : l'objectif a été relevé à **1,7**.

**Chaque défi porte une solution connue.** Un test vérifie que la référence échoue et que la solution réussit :

| Défi | Référence | Solution testée | Cible |
|---|---|---|---|
| Des bras pour les retraites | 1,59 actif par senior | 1,75 | ≥ 1,7 |
| Sauver la Creuse | 79 437 hab. (2100) | 151 337 | ≥ 100 000 |
| Repeupler la diagonale du vide (sans exode urbain) | 3,7 M (2060) | 4,6 M | ≥ niveau 2025 |
| Pas de déclin | 55,8 M (2100) | 72,4 M | ≥ 66 M |
| Des enfants dans les écoles | 4,6 M (2050) | 5,7 M | ≥ 5 M |
| Desserrer l’Île-de-France | 12,5 M (2050) | 11,2 M | ≤ 12 M, sans perte nationale |
| Des retraites tenables (2 événements) | 67,2 (2070) | 52,2 | ≤ 54 |
| Rajeunir la France | 52,1 ans (2070) | 49,4 ans | ≤ 50,5 ans |
| Résister à la pandémie (imposée) | — | 71,5 M (2040) | ≥ référence |

**Score sur 1 000 :** 600 pour la réussite, + 150 par événement non utilisé, + jusqu'à 250 selon la marge. Les étoiles valent 1 à 3 selon la sobriété et la marge. Les contraintes sont appliquées au moment de poser un événement : un message explique le refus. Le meilleur score est mémorisé localement.

### Devine (`src/game/quiz.ts`)

8 questions. **Les bonnes réponses sont calculées par la simulation**, jamais écrites à la main :
- « Quelle région gagne le plus ? » : 4 régions proposées, la bonne et 3 tirées avec une graine fixe ;
- « Plus, moins ou autant ? » : « autant » si l'écart est inférieur à 0,1 %.

Le calcul se fait dans le Worker, à part de la file d'affichage, pour ne rien révéler sur la carte avant la réponse. Après la réponse, la carte montre l'effet à l'année de la question, avec la phrase du récit.

Exemples de réponses calculées :
- Télétravail → Pays de la Loire (+ 3,8 %) ;
- Retraite à 67 ans → « autant » (question piège : la population ne change pas) ;
- Montée des eaux → Bretagne.

### Scénarios célèbres (`src/game/presets.ts`)

| Scénario | Contenu |
|---|---|
| Baby-boom rejoué | Fécondité × 1,4 de 2026 à 2045. Le baby-boom avait fait passer l'ICF d'environ 2,1 à près de 3 : la hausse relative est transposée, c'est une hypothèse de jeu |
| Canicule de 2003, tous les 5 ans | 15 canicules |
| France 2100 à +4 °C | Scénario fictif, inspiré de la trajectoire de réchauffement de référence pour l'adaptation |
| Tous au vert | — |
| Terre d’accueil | — |

Charger un scénario est une action annulable (Ctrl+Z).

### Tutoriel

4 étapes, **faites par le joueur** :
1. lancer le temps ;
2. poser « Télétravail généralisé » ;
3. avancer jusqu'en 2050 ;
4. cliquer sur l'écart.

L'élément à utiliser est mis en évidence, avec « Retour » et « Passer » toujours disponibles (règle « User Freedom » du skill ui-ux-pro-max). Le tutoriel démarre à la première visite, et le bouton « Aide » le relance. Le paramètre `?tutoriel=0` le désactive ; les tests l'utilisent.

## 12. Sauvegarde, partage, finitions — jalon 6

| Choix | Raison |
|---|---|
| Lien de partage `?s=…` | Le scénario en JSON est compressé (deflate, `CompressionStream` natif) puis encodé en base64url : environ 400 caractères pour 2 événements. On utilise un paramètre plutôt que le `#`, déjà employé par la navigation. Le paramètre est retiré de l'adresse après chargement. Un lien partagé ne lance pas le tutoriel |
| Validation de tout scénario importé (`validateScenario`) | Types d'événements connus seulement, zones et codes contrôlés, bornes sur toutes les valeurs, textes tronqués, événements personnalisés limités au préfixe `perso-`. Un lien ou un fichier abîmé affiche un message, sans planter |
| Sauvegardes locales (`localStorage`) | Nommées, 50 au plus, avec chargement, suppression confirmée et date ; elles restent sur l'appareil. Les écritures sont protégées (navigation privée, stockage plein) |
| Export PNG | La carte SVG est recopiée avec ses styles calculés en ligne, puis composée sur un canevas (×2) avec le titre, la légende (hachures comprises) et la mention des sources |
| Export CSV | Séparateur « ; », virgule décimale, BOM UTF-8 (ouverture directe dans un tableur français). Deux fichiers : évolution de la zone 2025-2100, et tous les départements pour l'année affichée ; les ratios estimés sont suffixés `_estime` |
| Aléa | Intensité de 0 à 100 % et « nouveau tirage » (graine) ; reproductible |
| Téléphone | Les outils de l'en-tête passent dans un menu sous 600 px |

### Mesures de performance (machine de développement, Ryzen 7 3700X, Chrome)

| Mesure | Valeur |
|---|---|
| Simulation complète dans le Worker (référence) | ≈ 70 ms (Vitest, médiane) ; 120 ms au premier calcul dans le navigateur (avant optimisation par le moteur JavaScript) |
| Réglage d'un événement → chiffres mis à jour à l'écran (build de production, 1 à 5 événements) | 86 à 122 ms |
| « D'où vient cet écart ? » | une simulation par événement (≈ 70 ms chacune), à la demande, mis en cache |
| JavaScript de l'application | 144 Ko compressés (+ 30 Ko pour le Worker) |
| Données chargées au démarrage | 370 Ko compressés |

La cible de « moins de 100 ms perçues » est **approchée mais pas toujours tenue** : le calcul complet reste de l'ordre de 70 à 120 ms. Les transitions de la carte (180 ms) lissent la mise à jour.


## 13. Améliorations après le jalon 6

### Outre-mer (périmètre : France entière)

Les 5 départements et régions d'outre-mer sont simulés : 101 départements, 18 régions.
- **Données :** estimations Insee, naissances, décès et espérance de vie, migrations du recensement 2022, Omphale.
- **Migrations :** les déménagements entre la métropole et les DROM sont internes. Mayotte n'est pas dans le fichier national des migrations comme lieu de résidence ; ses échanges internes sont exclus (sinon son taux de départ vaudrait 100 %), et son solde passe par le solde apparent.
- **Validation à périmètre identique** avec les projections Insee 2026 :
  - écart maximal sur l'évolution de la population : **0,32 point**, au lieu de 1,06 quand seule la métropole était simulée ;
  - part des 65 ans et plus : **0,14 point** au plus ;
  - projection à un an : 0,13 % d'écart moyen par département (au plus 0,51 %, en Martinique).
- **Carte :** médaillons en rangée en haut, chacun avec sa projection. Les contours IGN sont simplifiés à la construction (topojson-simplify, 4 % des sommets, 56 Ko).
- **Écarts à Omphale 2022 :** ils sont plus forts pour la Guyane et la Guadeloupe (jusqu'à 38 % sur la part de population en 2070). Omphale part de 2018 et suppose une fécondité de 1,8.

### Niveau de preuve des événements

| Niveau | Événements | Vérification |
|---|---|---|
| **Variante Insee** | Fécondité haute (1,70) et basse (1,20), espérance de vie haute et basse, migrations hautes (+230 000) et basses (+70 000), solde nul | Écart du moteur au scénario central comparé à celui de l'Insee, de 2030 à 2070 : à moins de 10 % (ex. fécondité haute en 2070 : +5,08 M contre +4,95 M) |
| **Calé sur l'histoire** | Pandémie (intensité forte = 2020), canicule (intensité forte = 2003) | +9,4 % de décès (2020 : +9 %) ; +2,8 % (2003 : +2,7 %) |
| **Hypothèse de jeu** | Les autres | Aucune : affiché comme tel sur chaque carte et chaque fiche |

Les variantes migratoires de l'Insee divergent du scénario central dès 2023 : on compare l'écart **accumulé depuis 2025**, année de départ du moteur. Les multiplicateurs de fécondité et de migration sont les rapports nominaux des hypothèses (1,70 / 1,45…). Ceux d'espérance de vie sont ajustés par simulation (×0,76 en 30 ans ; ×1,365 d'ici 2070).

### Réactivité

| Mesure (build de production, Chrome, Ryzen 7 3700X) | Avant | Après |
|---|---|---|
| Simulation complète | ≈ 78 ms | ≈ 61 ms (médiane dans le Worker) |
| Réglage → chiffres affichés, médiane | 86-122 ms | **80 ms** |
| Part des réglages affichés en moins de 100 ms | — | **92 %** (90e centile : 98 ms) |

Les leviers :
1. **Déménagements ciblés** cumulés puis répartis une seule fois ; une division remplacée par une multiplication.
2. **Reprise exacte à l'année du premier événement** : les états de la référence sont gardés en double précision dans le Worker. Le résultat est identique au bit près (testé) ; un événement en 2070 se calcule en 29 ms au lieu de 65.
3. **Recyclage des tableaux de résultats** (~9 Mo) entre la page et le Worker.
4. **Échauffement du Worker** avec un scénario qui exerce tous les types d'effets. Sans lui, la première simulation après l'apparition d'un nouveau type d'effet coûtait ~150 ms (désoptimisation du code par le moteur JavaScript).

Il reste de rares pointes (au plus ~150 ms).

### Téléphone

- L'historique détaillé des actions est dans le menu des outils.
- Les cartes d'événements ont une **poignée tactile** (`touch-action: none`) : on les glisse au doigt sur un département ou sur la frise, et le reste de la carte fait défiler la liste. C'est testé par de vrais événements tactiles (CDP `Input.dispatchTouchEvent`).

### CI

Le workflow `.github/workflows/ci.yml` a été rejoué à l'identique dans un clone vierge du dépôt : `npm ci`, typecheck, lint, 56 tests Vitest, build, 61 parcours Playwright avec `CI=1`. Tout passe.
