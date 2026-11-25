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

## Simulateur de duel druide

`/simulateur/` (dossier `public/simulateur`, repris de druidhow) : duels d'un druide farouche contre les
spécialisations jouées en duel, en ours et en félin, à son niveau, avec cinématique, guide par adversaire,
calculateur de talents et conseils pour gagner (talents, statistiques, enchantements, points d'héritage).
Tout le calcul se fait dans le navigateur, en JavaScript sans compilation.

- À chaque lecture d'un druide, le serveur convertit sa fiche Blizzard pour le moteur (`druide.js` :
  talents reconnus par leur nom, stats ramenées au format du moteur, objets) ;
  `GET /api/druides` renvoie ces druides, que la page charge au démarrage.
- Le bouton « Simuler » d'une carte de druide ouvre `/simulateur/?perso=<région>/<slug>#armurerie`.
- Les valeurs du jeu sont dans `public/simulateur/js/donnees.js`, le moteur dans `moteur.js`.

Tests : `npm test` (moteur, icônes, conseiller, conversion sur la fiche figée `tests/fixtures/ohm-let.json`).

## Déploiement

En ligne sur https://armurerie.lefournilcreatif.fr :

- `docker compose up -d --build` : conteneur sur `127.0.0.1:3130`, données dans le volume `donnees` (`/data`) ;
- Caddy (`/etc/caddy/sites/armurerie.caddy`) assure le HTTPS ; les requêtes de modification
  (`/api/*` hors GET) demandent un mot de passe, rangé dans `.env` (non versionné).
