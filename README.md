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

## Déploiement

En ligne sur https://armurerie.lefournilcreatif.fr :

- `docker compose up -d --build` : conteneur sur `127.0.0.1:3130`, données dans le volume `donnees` (`/data`) ;
- Caddy (`/etc/caddy/sites/armurerie.caddy`) assure le HTTPS ; les requêtes de modification
  (`/api/*` hors GET) demandent un mot de passe, rangé dans `.env` (non versionné).
