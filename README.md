# Et si… ?

Un jeu de simulation démographique de la France dans le navigateur. On déclenche des événements (pandémie, canicules, politique nataliste, exode urbain…) et on observe, année après année et département par département, comment la population s'écarte d'un scénario de référence fondé sur les données de l'Insee.

> **État : jalon 2 — carte, frise et lecture dans le temps.** La carte de France colore les départements (évolution, âge médian, seniors pour 100 actifs…) et montre les déménagements ; la frise fait défiler 2025-2100. Les événements arrivent au jalon 3.

## Installation

Il faut Node 22 ou plus. Python 3.11 ou plus n'est nécessaire que pour reconstruire les données.

```bash
npm install
npm run dev        # http://localhost:5173
```

Les données compactes sont déjà dans `public/data/` : aucun téléchargement n'est nécessaire pour lancer le jeu.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm test` | Tests du moteur (conservation, agrégations, déterminisme, performance, validation) |
| `npm run e2e` | Parcours Playwright (lecture, clavier, zones, accessibilité axe en clair et en sombre, ordinateur et téléphone) |
| `npm run lint` / `npm run typecheck` | Qualité du code |
| `npm run build` | Version de production dans `dist/` |
| `npm run data` | Retélécharge les sources Insee (≈ 200 Mo) et reconstruit `public/data/` |

Pour `npm run data`, créez une fois l'environnement Python :

```bash
python -m venv .venv-data
.venv-data/Scripts/python -m pip install -r scripts/build-data/requirements.txt   # Windows ; bin/python ailleurs
```

## Le modèle en termes simples

Chaque année, pour chaque département, chaque sexe et chaque âge :

1. tout le monde vieillit d'un an, et une petite partie décède, selon les risques de décès de l'Insee ;
2. des bébés naissent, selon le nombre d'enfants par femme à chaque âge ;
3. des habitants déménagent vers d'autres départements, comme on l'observe au recensement ;
4. des personnes arrivent de l'étranger ou partent à l'étranger.

C'est la **méthode des composantes**, celle qu'utilisent les démographes. Sans événement, le moteur suit les projections 2026 de l'Insee. Les écarts sont mesurés dans [DECISIONS.md](DECISIONS.md), et les sources sont listées dans [DATA_SOURCES.md](DATA_SOURCES.md).

## Licence des données

Insee et IGN, Licence Ouverte / Etalab 2.0.
