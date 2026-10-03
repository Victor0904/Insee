# Design system « Et si… ? » — MASTER

Source de vérité visuelle. Une page peut ajouter un fichier `pages/<page>.md`, qui l'emporte sur ce fichier pour cette page seulement.

## Origine (skill ui-ux-pro-max)

`search.py "<requête>" --design-system` a été lancé deux fois, avec « educational playful data visualization game map atlas » puis « educational interactive data visualization ». Les deux fois, il a renvoyé le style **Cyberpunk UI** (néon vert sur noir, police monospace), qui contredit la mission : identité d'atlas, mode clair, lisibilité grand public. Conformément au contrat du skill, ce résultat n'a **pas été retenu** (correspondance non vérifiée). Le système ci-dessous est composé à partir de recherches ciblées dans les domaines du skill :

| Recherche | Résultat retenu |
|---|---|
| `--domain style "editorial print atlas"` | **Editorial Grid / Magazine** : grille éditoriale, filets, cartouches |
| (1er essai, accessibilité) | **Accessible & Ethical** : contraste fort, focus visible, 16 px minimum |
| `--domain typography "editorial atlas cartography serif"` | **News Editorial** : Newsreader pour les titres |
| `--domain chart "choropleth map diverging colorblind"` | Choroplèthe, échelle **divergente** pour les écarts, légende chiffrée, motifs en plus de la couleur, tableau alternatif |
| `--domain chart "population pyramid comparison"` / `"small multiples trend"` | Styles de traits distincts (plein, pointillé), libellés directs, jamais la teinte seule |
| `--domain ux "dragging alternative keyboard"` | Alternative au glisser-déposer : boutons ou menu, clavier complet (WCAG 2.2 AA) |
| `--domain ux "onboarding tutorial skip"` | Tutoriel avec « Passer » et « Retour » |
| `--domain ux "reduced motion animation"` | `prefers-reduced-motion` ; 1 à 2 éléments animés par vue |

## Intention

« Atlas vivant » : l'univers d'un atlas démographique imprimé (papier, encre, filets fins, graticule, cartouches de légende), animé avec retenue. Pas de tableau de bord générique, pas de dégradé violet, pas de néon.

## Couleurs (jetons sémantiques)

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--paper` | `#F4F2EC` | `#0F141B` | fond de page |
| `--surface` | `#FBFAF6` | `#161D26` | panneaux, cartes |
| `--ink` | `#18202B` | `#ECEAE3` | texte principal |
| `--ink-muted` | `#4B5563` | `#A9B1BC` | texte secondaire (≥ 4,5:1 sur paper et surface) |
| `--rule` | `#CBC6B8` | `#2D3744` | filets décoratifs, graticule |
| `--control` | `#7D7768` | `#66748A` | bordure des champs et contrôles (≥ 3:1) |
| `--action` | `#18202B` | `#ECEAE3` | l'action principale unique (bouton encre plein) |
| `--focus` | `#6D28D9` | `#C4B5FD` | anneau de focus (≥ 3:1) |
| `--gain` | `#1F5FA6` | `#7DB3E8` | écart positif (toujours avec « + ») |
| `--loss` | `#A9520A` | `#F2A65A` | écart négatif (toujours avec « − » et hachures) |
| `--ref` | `#5C6370` | `#9AA3AE` | référence : trait **pointillé** |

L'échelle divergente gain/perte va du bleu à l'orange (paire sûre pour les daltoniens), avec un neutre papier au centre. L'échelle séquentielle (âge médian, densité) est de type cividis (bleu → jaune), lisible en vision daltonienne.

## Typographie

- Titres : **Newsreader** (500, 600), esprit revue et atlas.
- Texte et chiffres : **Atkinson Hyperlegible Next** (400, 600), chiffres tabulaires `font-variant-numeric: tabular-nums`.
- Polices auto-hébergées (@fontsource), aucun appel à un CDN.
- Échelle : 12 / 14 / 16 / 20 / 28 / 40 px. Corps de texte 16 px minimum, interligne 1,5.

## Espacement, formes, profondeur

- Grille de 4 px : 4, 8, 12, 16, 24, 32, 48.
- Rayons : 4 px pour les contrôles, 8 px pour les panneaux. Pas d'arrondis « bulle ».
- Ombres très légères (papier posé), filets de 1 px en `--rule`.
- Cibles : 44 × 44 px au tactile, 24 × 24 px minimum à la souris.

## Mouvement

- 150 à 250 ms, décélération à l'entrée ; sortie à environ 65 % de la durée d'entrée.
- Seules transform et opacity sont animées. Animations interruptibles.
- `prefers-reduced-motion` : transitions coupées, flux migratoires figés en traits statiques, lecture automatique désactivée par défaut.

## Règles de lecture des données (partout)

1. La référence et le scénario sont toujours visibles ensemble, sur la même échelle.
2. Gain = bleu + « + » ; perte = orange + « − » + hachures ; référence = pointillé gris.
3. Nombres au format français : `1 234 567`, `12,5 %`, signe moins typographique « − ».
4. Toute valeur estimée porte la mention « estimé » (infobulle avec la méthode).
5. Chaque graphique a un résumé textuel et un tableau accessible.

## Checklist avant chaque livraison d'écran

D'après `references/quick-reference.md` §1-§3, §5, §7, §10 du skill :

- [ ] Contraste AA vérifié (axe-core) en clair **et** en sombre
- [ ] Focus visible sur chaque élément interactif, ordre de tabulation logique
- [ ] Aucune information portée par la couleur seule
- [ ] Aucun emoji utilisé comme icône (SVG uniquement)
- [ ] 375, 768, 1024 et 1440 px sans défilement horizontal
- [ ] `prefers-reduced-motion` respecté
- [ ] États vides, de chargement et d'erreur prévus
- [ ] Alternative clavier ou clic à tout glisser-déposer
- [ ] Une seule action principale visible
