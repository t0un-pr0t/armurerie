# armurerie

Gestionnaire web des personnages **WoW Forever**, alimenté par l'armurerie officielle
(`worldofwarcraft.blizzard.com/<langue>/forever/<région>/armory/character/<prénom>-<nom>`).

## Lancer

    npm start            # ou : node server.js

puis ouvrir http://localhost:3000. Aucune dépendance (Node ≥ 18).

Variables d'environnement facultatives :

| Variable          | Défaut  | Rôle                                      |
|-------------------|---------|-------------------------------------------|
| `PORT`            | `3000`  | port HTTP                                 |
| `HOST`            | `0.0.0.0` | adresse d'écoute                        |
| `REFRESH_MINUTES` | `15`    | intervalle de réactualisation automatique |
| `LOCALE`          | `fr-fr` | langue des noms (classes, objets…)        |

## Fonctionnement

- La liste des personnages est dans `data/characters.json` (modifiable depuis l'interface).
- Le serveur lit la page d'armurerie de chaque personnage, en extrait les données
  (`characterProfileInitialState`) et les met en cache dans `data/cache.json`.
- Réactualisation automatique côté serveur ; la page se met à jour toute seule chaque minute.
- Un personnage absent de l'armurerie (pas encore indexé, nom mal orthographié) est affiché
  « introuvable » et retenté à chaque passage.

## Simulateur

`/simulateur/` (dossier `public/simulateur`) : tout personnage de l'armurerie, de n'importe quelle classe,
se compare aux joueurs de son rang (niveau ± 3). Tout le calcul se fait dans le navigateur, en JavaScript
sans compilation.

- **Classement** : les personnages de l'armurerie du même rang, classés par taux de victoire moyen contre
  les 17 spécialisations jouées en duel (à leur propre niveau), avec le joueur type de la spécialisation comme repère.
- **Fiche comparée** : vos stats face au joueur type et votre place parmi les joueurs de votre rang.
- **Duels** : 30 duels contre chaque spécialisation, 40 contre chaque vrai joueur du rang ;
  « Voir le duel » rejoue un duel typique (courbe des PV, dégâts par technique, journal).
- **Conseils** : gain en points de victoire avec un peu plus de PV, PA, dégâts d'arme, puissance des sorts,
  critique ou armure (mêmes duels avec et sans), adversaires difficiles.

Fonctionnement :

- À chaque lecture, le serveur convertit la fiche Blizzard en combattant (`combattant.js` : classe,
  spécialisation principale, talents, stats, armes) ; `GET /api/combattants` renvoie la liste.
- Le moteur toutes classes est `public/simulateur/js/arene.js` (Node et navigateur) : priorités par classe,
  sorts appris selon le niveau et les talents, contrôles et rendements décroissants, interruptions, familiers.
  Les joueurs types (`TYPES`, `SPECS_TYPES`) sont calés au niveau 60 puis ramenés au niveau voulu.
- Le bouton « Simuler » de chaque carte ouvre `/simulateur/?perso=<région>/<slug>`.

### Simulateur détaillé druide farouche

`/simulateur/druide.html` (repris de druidhow) : ours et félin contre chaque spécialisation, cinématique,
guide par adversaire, calculateur de talents et conseils (talents, statistiques, enchantements, points
d'héritage). Le serveur convertit chaque druide avec `druide.js` ; `GET /api/druides` les renvoie.
Valeurs du jeu dans `public/simulateur/js/donnees.js`, moteur dans `moteur.js`. Lien depuis la page
générique pour les druides.

Tests : `npm test` (arène, conversion des combattants et des druides sur les fiches figées de
`tests/fixtures/`, moteur druide, icônes, conseiller).

## Déploiement

En ligne sur https://armurerie.lefournilcreatif.fr :

- `docker compose up -d --build` : conteneur sur `127.0.0.1:3130`, données dans le volume `donnees` (`/data`) ;
- Caddy (`/etc/caddy/sites/armurerie.caddy`) assure le HTTPS ; les requêtes de modification
  (`/api/*` hors GET) demandent un mot de passe, rangé dans `.env` (non versionné).
